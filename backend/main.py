from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# from ml.model import run_model
# from coach.coach_agent import get_coach_feedback
# from db.database import init_db, save_statistics

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # ✔ correct
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# test
@app.get("/ping")
def ping():
    return {"message": "ping from backend!"}

# returns fake results for now
@app.post("/analyze-video")
async def analyze_video(file: UploadFile = File(...)):
    return {
        "status": "received",
        "filename": file.filename,
        "analysis": {
            "swing_speed": 320,
            "contact_point_quality": "good",
            "footwork_efficiency": 0.82
        }
    }
