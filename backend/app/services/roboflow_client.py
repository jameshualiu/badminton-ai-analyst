import cv2
import httpx
import numpy as np
from config.settings import ROBOFLOW_API_KEY, ROBOFLOW_MODEL_ID

# Ensure ID is like "shuttlecock-cqzy3/1"
ROBOFLOW_URL = f"https://detect.roboflow.com/{ROBOFLOW_MODEL_ID}"

async def detect_shuttle_async(frame: np.ndarray) -> dict:
    """
    Sends the OpenCV frame as a file upload (multipart/form-data).
    This avoids all Base64 encoding issues.
    """
    
    # 1. Encode frame to JPEG bytes (in memory)
    success, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    if not success:
        raise Exception("Failed to encode frame.")
    
    # Get the raw bytes
    image_bytes = buffer.tobytes()

    # 2. Send as a "file" using httpx
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                ROBOFLOW_URL,
                params={
                    "api_key": ROBOFLOW_API_KEY,
                },
                # ⚠️ THE FIX: Send as 'files' parameter (Multipart Upload)
                # Format: {'form_field_name': ('filename', bytes, 'content_type')}
                files={
                    "file": ("image.jpg", image_bytes, "image/jpeg")
                }
            )

            if response.status_code != 200:
                print(f"⚠️ Roboflow Error: {response.status_code} - {response.text}")
                return {}

            return response.json()

        except Exception as e:
            print(f"Network Error: {e}")
            return {}