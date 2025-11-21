# app/models/schemas.py
from pydantic import BaseModel
from typing import List, Optional

# Defines the structure for a single detection box (Shuttle or Player)
class BoundingBox(BaseModel):
    x: float
    y: float
    w: float
    h: float
    confidence: float
    class_name: str

# Defines the analysis for a single frame
class FrameAnalysis(BaseModel):
    frame_number: int
    shuttlecock: Optional[BoundingBox] = None
    player_1_pose: Optional[List[float]] = None # List of 17 keypoint coordinates (34 values)
    player_2_pose: Optional[List[float]] = None
    
# Defines the final report structure returned to the frontend
class FinalReport(BaseModel):
    total_frames_processed: int
    total_shots_detected: int
    rally_analysis: List[FrameAnalysis]
    # You will add the LLM text analysis report here later