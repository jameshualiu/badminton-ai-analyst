import modal
import os
import json
from pathlib import Path

# 1. Define the Modal App
app = modal.App("badminton-ai-worker")

# 2. Define the GPU Environment (Container Image)
# worker_image = (
#     modal.Image.from_registry("nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04", add_python="3.11")
#     .apt_install("libgl1-mesa-glx", "libglib2.0-0")
#     .pip_install(
#         "torch==2.2.2+cu121",
#         "torchvision==0.17.2+cu121",
#         extra_index_url="https://download.pytorch.org/whl/cu121",
#     )
#     .pip_install("onnxruntime==1.20.1")
#     .pip_install_from_requirements("worker/requirements.txt")
#     .add_local_python_source("worker/inference", "worker/pipeline", "worker/court_detector")
# )

worker_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04",
        add_python="3.11",
        force_build=True
    )
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch==2.2.2+cu121",
        "torchvision==0.17.2+cu121",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install("onnxruntime==1.20.1")
    .pip_install_from_requirements("worker/requirements.txt")
    .add_local_dir(
        "worker",
        remote_path="/root",
        # Weights come from the Modal volume; training data stays local
        ignore=["weights/**", "train/features_v3/**", "**/__pycache__/**", ".pytest_cache/**"],
    )
)

# 3. Create a Modal Volume for Persistent Model Storage
models_volume = modal.Volume.from_name("badminton-models", create_if_missing=True)
MODELS_DIR = Path("/models")

@app.function(
    image=worker_image,
    volumes={MODELS_DIR: models_volume},
    secrets=[modal.Secret.from_name("badminton-ai-secrets")],
    gpu="T4",
    timeout=1200
)
@modal.fastapi_endpoint(method="POST")
def process_badminton_video(data: dict):
    """
    Webhook entrypoint: Receives video details and starts analysis.
    """
    video_id = data["videoId"]
    user_id = data["userId"]
    video_e2_key = data["videoE2Key"]
    
    import boto3
    import firebase_admin
    from firebase_admin import credentials, firestore
    
    from inference import BadmintonInference
    from pipeline import BadmintonPipeline

    # --- R2 Config ---
    s3 = boto3.client(
        's3',
        endpoint_url=os.environ["R2_ENDPOINT"],
        region_name='auto',
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"]
    )
    bucket = os.environ["R2_BUCKET_NAME"]
    
    # --- Firebase Setup ---
    fb_cred = {
        "type": "service_account",
        "project_id": os.environ["FIREBASE_PROJECT_ID"],
        "private_key": os.environ["FIREBASE_PRIVATE_KEY"].replace("\\n", "\n"),
        "client_email": os.environ["FIREBASE_CLIENT_EMAIL"],
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    if not firebase_admin._apps:
        cred = credentials.Certificate(fb_cred)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    
    video_doc_ref = db.collection("users").document(user_id).collection("videos").document(video_id)
    
    try:
        # Step 1: Status Update & Volume Check
        video_doc_ref.update({"status": "running"})
        print(f"[debug] Diagnostic: Scanning Volume at {MODELS_DIR}")
        
        # Build a map of what's actually in the volume (recursively)
        all_volume_files = {f.name: f for f in MODELS_DIR.glob("**/*") if f.is_file()}
        print(f"[volume] Volume contains: {list(all_volume_files.keys())}")

        # Step 2: Resolve Model Paths (Smart Search)
        model_targets = {
            "tracknet": "ball_track.pt",
            "court_kprcnn": "court_kpRCNN.pth",
            "net_kprcnn": "net_kpRCNN.pth",
            "yolo_pose": "yolo11x-pose.pt",
            "lstm": "15Matches_LSTM.onnx",
        }
        resolved_paths = {}

        # TrackNetV3 weights are optional: worker falls back to legacy TrackNet when absent
        optional_targets = {
            "tracknet_v3": "TrackNet_best.pt",
            "inpaintnet": "InpaintNet_best.pt",
            "hit_detector": "hit_detector_v3.onnx",
            "bst": "bst_stroke_classifier.pt",
        }

        for key, filename in {**model_targets, **optional_targets}.items():
            optional = key in optional_targets
            if filename in all_volume_files:
                resolved_paths[key] = str(all_volume_files[filename])
                print(f"[OK] Found {filename} in Volume at: {resolved_paths[key]}")
            else:
                # Backup: Try to download from R2 if missing from Volume
                target_path = MODELS_DIR / filename
                print(f"[download] {filename} missing from Volume. Attempting R2 download: models/{filename}")
                try:
                    s3.download_file(bucket, f"models/{filename}", str(target_path))
                    resolved_paths[key] = str(target_path)
                    print(f"[OK] Successfully recovered {filename} from R2")
                except Exception as e:
                    if optional:
                        resolved_paths[key] = None
                        print(f"[WARN] Optional model '{filename}' not found in Volume or R2; continuing without it")
                    else:
                        print(f"[ERROR] 404 ERROR: '{filename}' not found in Volume OR R2 bucket '{bucket}' path 'models/{filename}'")
                        raise e

        models_volume.commit()

        # Step 3: Download Raw Video
        local_video = f"/tmp/{video_id}.mp4"
        print(f"[video] Downloading video: {video_e2_key} from {bucket}")
        try:
            s3.download_file(bucket, video_e2_key, local_video)
        except Exception as e:
            print(f"[ERROR] Video Download Error: {e}")
            raise e
        
        # Step 3.5: Extract thumbnail
        thumbnail_url = None
        try:
            from decord import VideoReader, cpu
            import cv2
            import numpy as np

            vr = VideoReader(local_video, ctx=cpu(0), width=640, height=360)
            fps = vr.get_avg_fps() or 25  # 25 fps assumed if video reports 0 (malformed/fallback)
            target_frame = min(int(fps * 5), len(vr) - 1)
            frame_rgb = vr[target_frame].asnumpy()
            frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
            ok, buf = cv2.imencode('.jpg', frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ok:
                thumb_key = f"outputs/{user_id}/{video_id}/thumbnail.jpg"
                s3.put_object(
                    Bucket=bucket,
                    Key=thumb_key,
                    Body=buf.tobytes(),
                    ContentType='image/jpeg',
                )
                thumbnail_url = s3.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': bucket, 'Key': thumb_key},
                    ExpiresIn=604800,  # 7 days
                )
                print(f"[thumb] Thumbnail uploaded: {thumb_key}")
            else:
                print("[thumb] WARNING: cv2.imencode failed, skipping thumbnail")
        except Exception as e:
            print(f"[thumb] WARNING: Thumbnail extraction failed (non-fatal): {e}")

        # Step 4: Run Analysis Pipeline
        print("[init] Initializing AI Engine...")
        inference = BadmintonInference(
            resolved_paths["tracknet"],
            resolved_paths["court_kprcnn"],
            resolved_paths["net_kprcnn"],
            resolved_paths["yolo_pose"],
            lstm_path=resolved_paths.get("lstm"),
            tracknet_v3_path=resolved_paths.get("tracknet_v3"),
            inpaintnet_path=resolved_paths.get("inpaintnet"),
            hit_detector_path=resolved_paths.get("hit_detector"),
            bst_path=resolved_paths.get("bst"),
        )
        pipeline = BadmintonPipeline(inference)
        # No frame cap (WK-09): the real constraint on processing length is
        # this function's own timeout=1200 (20 min) above, not an arbitrary
        # frame count.
        results = pipeline.process_video(local_video)
        
        # Step 5: Save analysis.json and Upload back to E2
        results_local = f"/tmp/{video_id}_analysis.json"
        with open(results_local, 'w') as f:
            json.dump(results, f)
            
        results_e2_key = f"outputs/{user_id}/{video_id}/analysis.json"
        s3.upload_file(results_local, bucket, results_e2_key)
        
        # Step 6: Finalize Database Record (Lean Schema)
        video_doc_ref.update({
            "status": "done",
            "duration": results["summary"]["durationSec"],
            "totalShots": results["summary"]["totalShots"],
            "analysisJson": results_e2_key,
            "thumbnailUrl": thumbnail_url,
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        print(f"[done] Processing Complete for {video_id}!")
        
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        video_doc_ref.update({"status": "failed", "error": str(e)})
        raise e

@app.local_entrypoint()
def main(video_id: str, user_id: str, video_e2_key: str):
    process_badminton_video.remote(video_id, user_id, video_e2_key)
