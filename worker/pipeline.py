import cv2
import numpy as np
import json
from decord import VideoReader, cpu
from inference import BadmintonInference

class BadmintonPipeline:
    def __init__(self, inference_engine: BadmintonInference):
        self.engine = inference_engine
        self.geometry = None
        self.homography_matrix = None
        
        self.COURT_WIDTH = 6.1  
        self.COURT_HEIGHT = 13.4 
        
        self.TARGET_CORNERS = np.array([
            [0, 0],
            [self.COURT_WIDTH, 0],
            [self.COURT_WIDTH, self.COURT_HEIGHT],
            [0, self.COURT_HEIGHT]
        ], dtype="float32")

    def setup_homography(self, video_path, search_limit=150):
        vr = VideoReader(video_path, ctx=cpu(0), width=640, height=360)
        print(f"🌐 Turbo-searching for court geometry...")
        for i in range(0, min(search_limit, len(vr)), 10):
            frame = vr[i].asnumpy()
            geom = self.engine.detect_geometry(frame)
            if geom["court"]:
                self.geometry = geom
                break
        
        if not self.geometry:
            print("⚠️ Warning: No court found.")
            return

        pts = np.array(self.geometry["court"], dtype="float32")
        s = pts.sum(axis=1)
        diff = np.diff(pts, axis=1)
        src_pts = np.array([pts[np.argmin(s)], pts[np.argmin(diff)], pts[np.argmax(s)], pts[np.argmax(diff)]], dtype="float32")
        self.homography_matrix, _ = cv2.findHomography(src_pts, self.TARGET_CORNERS)
        print("✅ Homography Ready.")

    def pixel_to_meters(self, x, y):
        if self.homography_matrix is None or x is None or y is None: return None
        point = np.array([[[x, y]]], dtype="float32")
        return cv2.perspectiveTransform(point, self.homography_matrix)[0][0].tolist()

    def process_video(self, video_path, batch_size=8, limit_frames=3600):
        self.setup_homography(video_path)
        
        # Decode directly at TrackNet resolution (512x288) to skip CPU resizing
        vr = VideoReader(video_path, ctx=cpu(0), width=512, height=288)
        fps = vr.get_avg_fps()
        total_frames = min(len(vr), limit_frames) if limit_frames else len(vr)
        
        ball_tracking = []
        player_tracking = []
        
        print(f"🚀 Lean Analysis Starting ({total_frames} frames)...")
        
        for start_idx in range(0, total_frames, batch_size):
            end_idx = min(start_idx + batch_size, total_frames)
            actual_batch_size = end_idx - start_idx
            
            # 1. Zero-Redundancy Fetch: Get batch + 1 padding frame on each side
            safe_indices = [max(0, min(total_frames - 1, idx)) for idx in range(start_idx - 1, end_idx + 1)]
            padded_frames = vr.get_batch(safe_indices).asnumpy() # (B+2, 288, 512, 3)
            
            # 2. YOLO Batch Inference (Middle frames)
            frames = padded_frames[1:-1]
            # Convert to a list of contiguous arrays for YOLO to process safely
            yolo_input = [np.ascontiguousarray(f) for f in frames]
            yolo_results = list(self.engine.predict_pose_batch(yolo_input))
            
            # 3. TrackNet Vectorized Stacking (No Python loops for images)
            stacks = np.stack([padded_frames[j:j+3] for j in range(actual_batch_size)]) # (B, 3, 288, 512, 3)
            moved = stacks.transpose(0, 1, 4, 2, 3) # (B, 3 frames, 3 channels, H, W)
            track_tensor = moved.reshape(actual_batch_size, 9, 288, 512).astype('float32') / 255.0
            
            # 4. GPU Inference
            heatmaps = self.engine.predict_ball_batch(track_tensor) # (B, 1, 288, 512)
            
            # 5. Vectorized Heatmap Extraction
            flat_heatmaps = heatmaps.reshape(actual_batch_size, -1)
            max_vals = flat_heatmaps.max(axis=1)
            max_idx = flat_heatmaps.argmax(axis=1)
            y_coords, x_coords = np.unravel_index(max_idx, (288, 512))
            
            # 6. Aggregation
            for i in range(actual_batch_size):
                f_idx = start_idx + i
                
                # Players
                res = yolo_results[i]
                players = []
                if res.keypoints is not None and len(res.keypoints) > 0:
                    kpts_xy = res.keypoints.xy.cpu().numpy()
                    boxes_xyxy = res.boxes.xyxy.cpu().numpy()
                    for p_id in range(len(kpts_xy)):
                        if p_id < len(boxes_xyxy):
                            players.append({
                                "id": p_id,
                                "skeleton": kpts_xy[p_id].tolist(),
                                "box": boxes_xyxy[p_id].tolist()
                            })
                player_tracking.append({"frame": f_idx, "players": players})

                # Ball
                ball_pos = None
                if max_vals[i] > 0.5:
                    ball_pos = [int(x_coords[i]), int(y_coords[i])]
                ball_tracking.append({"frame": f_idx, "ball": ball_pos})

            if start_idx % (batch_size * 20) == 0:
                print(f"   💨 Processed {start_idx}/{total_frames} frames...")

        hits = self.detect_hits(ball_tracking)
        
        return {
            "summary": {
                "durationSec": total_frames / (fps if fps > 0 else 30),
                "totalShots": len(hits),
                "shotCounts": {"Clear/Drop": len(hits)},
                "resolution": [512, 288]
            },
            "geometry": self.geometry,
            "events": hits,
            "tracking": player_tracking
        }

    def detect_hits(self, ball_tracking):
        hits = []
        if len(ball_tracking) < 5: return hits
        for i in range(2, len(ball_tracking) - 2):
            curr = ball_tracking[i]["ball"]
            prev = ball_tracking[i-1]["ball"]
            if curr and prev:
                dy = curr[1] - prev[1]
                if i > 2 and 'dy_prev' in ball_tracking[i-1]:
                    if ball_tracking[i-1]['dy_prev'] > 1.0 and dy < -1.0:
                        hits.append({
                            "frame": ball_tracking[i]["frame"],
                            "location_px": curr,
                            "location_m": self.pixel_to_meters(curr[0], curr[1]),
                            "type": "Clear/Drop"
                        })
                ball_tracking[i]['dy_prev'] = dy
        return hits
