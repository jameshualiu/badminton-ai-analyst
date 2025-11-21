# backend/setup_models.py
import os
from ultralytics import YOLO
import shutil

# Define the target folder
target_folder = "models"
model_name = "yolov8n-pose.pt"

# Ensure the models folder exists
os.makedirs(target_folder, exist_ok=True)

print(f"⬇️ Downloading {model_name}...")
# This downloads the model to the current directory (backend/)
model = YOLO(model_name) 

# Get the path where it was downloaded (usually current dir)
current_path = model_name 

# Define where you want it to go
destination_path = os.path.join(target_folder, model_name)

# Move the file
if os.path.exists(current_path):
    shutil.move(current_path, destination_path)
    print(f"✅ Success! Model moved to: {destination_path}")
else:
    print(f"⚠️ Logic check: File might have already been in {target_folder} or global cache.")