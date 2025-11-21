from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import shutil
import os

# Import your core logic engine
from app.core.analysis_engine import process_uploaded_video

router = APIRouter()

# Create a temporary directory for uploads if it doesn't exist
UPLOAD_DIR = "data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/analyze")
async def analyze_video_endpoint(video_file: UploadFile = File(...)):
    """
    Endpoint to receive a video file, process it, and return analysis results.
    """
    # 1. Validate File Type
    if not video_file.filename.endswith(('.mp4', '.avi', '.mov', '.MOV')):
        raise HTTPException(status_code=400, detail="Invalid file type. Only video files allowed.")

    # 2. Save the file temporarily to disk
    # We do this because OpenCV needs a file path to read from
    temp_file_path = os.path.join(UPLOAD_DIR, f"temp_{video_file.filename}")
    
    try:
        with open(temp_file_path, "wb") as buffer:
            # Efficiently copy the file object to the buffer
            shutil.copyfileobj(video_file.file, buffer)
            
        # 3. Call the core analysis engine (The Brain)
        # We use 'await' because process_uploaded_video is an async function
        analysis_results = await process_uploaded_video(temp_file_path)
        
        return JSONResponse(content=analysis_results)

    except Exception as e:
        # Log the error for debugging
        print(f"Error processing video: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
        
    finally:
        # 4. Cleanup: Always remove the temp file to save space
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)