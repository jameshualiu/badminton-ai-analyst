import modal
import os
import json
from pathlib import Path

# 1. Define the Modal App
app = modal.App("badminton-ai-worker")

# 2. Define the GPU Environment (Container Image)
# Based on documentation: add_local_python_source takes module names
worker_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")
    .pip_install_from_requirements("worker/requirements.txt")
    .add_local_python_source("inference", "pipeline") 
)

# 3. Create a Modal Volume for Persistent Model Storage
models_volume = modal.Volume.from_name("badminton-models", create_if_missing=True)
MODELS_DIR = Path("/models")

@app.function(
    image=worker_image,
    volumes={MODELS_DIR: models_volume},
    secrets=[modal.Secret.from_name("badminton-ai-secrets")],
    gpu="T4",
    timeout=1200 # Increased to 20 minutes
)
def process_badminton_video(video_id: str, user_id: str, video_e2_key: str):
    """
    Worker entrypoint: Downloads video, runs pipeline, and updates results.
    """
    import boto3
    import firebase_admin
    from firebase_admin import credentials, firestore
    
    # These should now be importable because of add_local_python_source
    from inference import BadmintonInference
    from pipeline import BadmintonPipeline

    # --- S3/E2 Config ---
    s3 = boto3.client(
        's3',
        endpoint_url=os.environ["E2_ENDPOINT"],
        region_name=os.environ.get("E2_REGION", "auto"),
        aws_access_key_id=os.environ["E2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["E2_SECRET_ACCESS_KEY"]
    )
    bucket = os.environ["E2_BUCKET_NAME"]
    
    # --- Firebase Setup ---
    fb_cred_json = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    if not firebase_admin._apps:
        cred = credentials.Certificate(fb_cred_json)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    
    video_doc_ref = db.collection("users").document(user_id).collection("videos").document(video_id)
    
    try:
        # Step 1: Update Status to "running"
        video_doc_ref.update({"status": "running"})
        
        # Step 2: Ensure Models are synced to Volume
        onnx_path = MODELS_DIR / "tracknet.onnx"
        court_path = MODELS_DIR / "yolov8s-seg_court_detection.pt"
        net_path = MODELS_DIR / "yolov8s-seg_net_detection.pt"
        
        for m_path, m_key in [(onnx_path, "models/tracknet.onnx"), 
                               (court_path, "models/yolov8s-seg_court_detection.pt"),
                               (net_path, "models/yolov8s-seg_net_detection.pt")]:
            if not m_path.exists():
                print(f"📥 Fetching {m_key} from E2...")
                s3.download_file(bucket, m_key, str(m_path))
        models_volume.commit()

        # Step 3: Download Raw Video
        local_video = f"/tmp/{video_id}.mp4"
        print(f"🎬 Downloading video: {video_e2_key}")
        s3.download_file(bucket, video_e2_key, local_video)
        
        # Step 4: Run Analysis Pipeline
        inference = BadmintonInference(str(onnx_path), str(court_path), str(net_path))
        pipeline = BadmintonPipeline(inference)
        results = pipeline.process_video(local_video)
        
        # Step 5: Save analysis.json and Upload back to E2
        results_local = f"/tmp/{video_id}_analysis.json"
        with open(results_local, 'w') as f:
            json.dump(results, f)
            
        results_e2_key = f"outputs/{user_id}/{video_id}/analysis.json"
        s3.upload_file(results_local, bucket, results_e2_key)
        
        # Step 6: Finalize Database Record
        video_doc_ref.update({
            "status": "done",
            "summary.totalShots": results["summary"]["totalShots"],
            "summary.durationSec": results["summary"]["durationSec"],
            "summary.shotCounts": results["summary"]["shotCounts"],
            "artifacts.analysisJson": results_e2_key,
            "progress.stage": "COMPLETE",
            "progress.pct": 100
        })
        print(f"🎉 Processing Complete for {video_id}!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        video_doc_ref.update({"status": "failed", "error": str(e)})
        raise e

@app.local_entrypoint()
def main(video_id: str, user_id: str, video_e2_key: str):
    process_badminton_video.remote(video_id, user_id, video_e2_key)
