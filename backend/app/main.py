from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 1. Import your routers
from app.api.endpoints import analysis
# 2. Import the model loader function
from app.dependencies.model_loader import load_pose_model

app = FastAPI(title="Badminton AI Analyst API")

# --- CORS CONFIGURATION ---
# This is critical for allowing your React Frontend to talk to this Backend
origins = [
    "http://localhost:3000",      # Standard Vite/React port
    "http://127.0.0.1:3000",
    "http://localhost:5173",      # Alternative Vite port
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (POST, GET, etc.)
    allow_headers=["*"],  # Allow all headers
)

# --- STARTUP EVENTS ---
@app.on_event("startup")
async def startup_event():
    """
    This runs once when the server starts. 
    It loads the heavy YOLO-Pose model into memory immediately 
    so the first user request is fast.
    """
    print("🚀 Starting up... Loading models...")
    load_pose_model()
    print("✅ Models loaded and ready.")

# --- ROUTER REGISTRATION ---
# This fixes the "Not Found" error!
# It tells FastAPI: "The code for /analyze is inside this router file"
app.include_router(analysis.router)

# --- HEALTH CHECK ---
@app.get("/")
def root():
    return {
        "message": "Badminton AI Analyst Backend is Running!",
        "docs": "Go to http://localhost:8000/docs to test the API"
    }