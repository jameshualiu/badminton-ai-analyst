import modal
import os
import json
from pathlib import Path

# 1. Define the Modal App
app = modal.App("badminton-ai-worker")

# 2. Define the GPU Environment (Container Image)
worker_image = (
    modal.Image.from_registry("nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04", add_python="3.11")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch==2.2.2+cu121",
        "torchvision==0.17.2+cu121",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install("onnxruntime==1.20.1")
    .pip_install_from_requirements("worker/requirements.txt")
    .add_local_python_source("inference", "pipeline", "court_detector")
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
        print(f"🔍 Diagnostic: Scanning Volume at {MODELS_DIR}")
        
        # Build a map of what's actually in the volume (recursively)
        all_volume_files = {f.name: f for f in MODELS_DIR.glob("**/*") if f.is_file()}
        print(f"📁 Volume contains: {list(all_volume_files.keys())}")

        # Step 2: Resolve Model Paths (Smart Search)
        model_targets = {
            "tracknet": "ball_track.pt",
            "court_kprcnn": "court_kpRCNN.pth",
            "net_kprcnn": "net_kpRCNN.pth",
            "yolo_pose": "yolo11x-pose.pt",
            "lstm": "15Matches_LSTM.onnx",
        }
        resolved_paths = {}

        for key, filename in model_targets.items():
            if filename in all_volume_files:
                resolved_paths[key] = str(all_volume_files[filename])
                print(f"✅ Found {filename} in Volume at: {resolved_paths[key]}")
            else:
                # Backup: Try to download from R2 if missing from Volume
                target_path = MODELS_DIR / filename
                print(f"📡 {filename} missing from Volume. Attempting R2 download: models/{filename}")
                try:
                    s3.download_file(bucket, f"models/{filename}", str(target_path))
                    resolved_paths[key] = str(target_path)
                    print(f"✅ Successfully recovered {filename} from R2")
                except Exception as e:
                    print(f"❌ 404 ERROR: '{filename}' not found in Volume OR R2 bucket '{bucket}' path 'models/{filename}'")
                    raise e

        models_volume.commit()

        # Step 3: Download Raw Video
        local_video = f"/tmp/{video_id}.mp4"
        print(f"🎬 Downloading video: {video_e2_key} from {bucket}")
        try:
            s3.download_file(bucket, video_e2_key, local_video)
        except Exception as e:
            print(f"❌ Video Download Error: {e}")
            raise e
        
        # Step 4: Run Analysis Pipeline
        print("⚙️ Initializing AI Engine...")
        inference = BadmintonInference(
            resolved_paths["tracknet"],
            resolved_paths["court_kprcnn"],
            resolved_paths["net_kprcnn"],
            resolved_paths["yolo_pose"],
            lstm_path=resolved_paths.get("lstm"),
        )
        pipeline = BadmintonPipeline(inference)
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
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        print(f"🎉 Processing Complete for {video_id}!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        video_doc_ref.update({"status": "failed", "error": str(e)})
        raise e

@app.local_entrypoint()
def main(video_id: str, user_id: str, video_e2_key: str):
    process_badminton_video.remote(video_id, user_id, video_e2_key)
