import cv2
import numpy as np
from typing import Dict, Any, List
from ..dependencies.model_loader import get_pose_model 

FRAME_SKIP = 5   # adjust for speed vs accuracy

async def process_uploaded_video(video_path: str) -> Dict[str, Any]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception("Could not open video file for processing.")

    pose_model = get_pose_model()   # Load YOLO pose model

    all_frame_results: List[Dict[str, Any]] = []
    frame_count = 0

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        if frame_count % FRAME_SKIP != 0:
            frame_count += 1
            continue

        # -------------------------
        # YOLO POSE INFERENCE
        # -------------------------
        results = pose_model(frame, verbose=False)

        pose_keypoints = []

        # Results come as a list
        if results:
            r = results[0]  # YOLO always returns a list
            if r.keypoints is not None:
                # Convert tensor → Python list
                pose_keypoints = r.keypoints.xy.cpu().numpy().tolist()

        # -------------------------
        # STORE RESULTS
        # -------------------------
        all_frame_results.append({
            "frame": frame_count,
            "pose_keypoints": pose_keypoints,  # JSON-safe
            "is_person_detected": len(pose_keypoints) > 0
        })

        frame_count += 1

        # OPTIONAL: safety stop during development
        if frame_count > 200:
            break

    cap.release()

    return {
        "total_frames_processed": frame_count,
        "total_pose_detections": sum(1 for r in all_frame_results if r["is_person_detected"]),
        "analysis_log": all_frame_results
    }
