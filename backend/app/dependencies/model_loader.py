# app/dependencies/model_loader.py
from ultralytics import YOLO

# Global variable to hold the loaded model
POSE_MODEL = None

# ⚠️ Note: For a real app, use the startup event in main.py to call this function.
def load_pose_model():
    """Loads the YOLO-Pose model weights from the local file system."""
    global POSE_MODEL
    # Replace 'yolov8n-pose.pt' with the actual path/name of your model file
    model_path = "models/yolov8n-pose.pt" 
    
    try:
        # Load the pose model, leveraging any available GPU
        POSE_MODEL = YOLO(model_path) 
        print(f"--- Successfully loaded YOLO Pose model: {model_path} ---")
    except Exception as e:
        print(f"--- ERROR loading YOLO Pose model: {e} ---")
        POSE_MODEL = None # Ensure it's explicitly None if loading fails
        
def get_pose_model():
    """Dependency function to inject the model into endpoints."""
    if POSE_MODEL is None:
        # Load if not already loaded (e.g., if startup event was skipped)
        load_pose_model() 
    return POSE_MODEL