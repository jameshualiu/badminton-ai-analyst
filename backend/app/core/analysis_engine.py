import cv2
import asyncio
import numpy as np
from typing import Dict, Any, List
from ..services.roboflow_client import detect_shuttle_async
from ..dependencies.model_loader import get_pose_model 

FRAME_SKIP = 5 # Process 1 out of every 5 frames (Adjust to 30 for speed)

async def process_uploaded_video(video_path: str) -> Dict[str, Any]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception("Could not open video file for processing.")

    # 1. Get the model instance
    pose_model = get_pose_model()
        
    all_frame_results: List[Dict[str, Any]] = []
    frame_count = 0
    
    while cap.isOpened():
        # --- DEV: HARD STOP FOR DEMO ---
        if frame_count > 200: 
            break

        success, frame = cap.read()
        if not success:
            break
        
        if frame_count % FRAME_SKIP != 0:
            frame_count += 1
            continue

        # --- INFERENCE ---
        
        # A. Roboflow (Async)
        shuttle_task = asyncio.create_task(detect_shuttle_async(frame))
        
        # B. YOLO Pose (Sync) - Get raw list results
        pose_results_list = pose_model(frame, verbose=False)
        
        # --- DATA PROCESSING  ---
        
        # Extract Keypoints from the raw YOLO object into a JSON-friendly list
        pose_data = []
        if pose_results_list:
            for r in pose_results_list:
                if r.keypoints is not None and r.keypoints.xy is not None:
                    # .cpu().numpy().tolist() converts the GPU Tensor -> Python List
                    # This fixes the "Object of type Tensor is not JSON serializable" error
                    pose_data = r.keypoints.xy.cpu().numpy().tolist()

        # Wait for Roboflow
        try:
            shuttle_results = await shuttle_task
        except Exception as e:
            print(f"Inference Error on Frame {frame_count}: {e}")
            frame_count += 1
            continue

        # --- AGGREGATION ---
        if shuttle_results:
            all_frame_results.append({
                "frame": frame_count,
                "shuttle_pos": shuttle_results.get('predictions', []),
                "is_detected": bool(shuttle_results.get('predictions')),
                # FIX: Use the processed 'pose_data' list, not the raw object
                "pose_keypoints": pose_data 
            })
            
        frame_count += 1

    cap.release()
    
    final_report = {
        "total_frames_processed": frame_count,
        "total_shuttle_detections": sum(1 for res in all_frame_results if res['is_detected']),
        "analysis_log": all_frame_results,
    }
    
    return final_report