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
        # Use same resolution as main processing so pixel coords are consistent
        vr = VideoReader(video_path, ctx=cpu(0), width=512, height=288)
        print(f"🌐 Searching for court geometry...")
        for i in range(0, min(search_limit, len(vr)), 10):
            frame = vr[i].asnumpy()
            geom = self.engine.detect_geometry(frame)
            if geom.get("court_keypoints_6"):
                self.geometry = geom
                break

        if not self.geometry:
            print("⚠️  Warning: No court found. Homography unavailable.")
            return

        kp6 = self.geometry["court_keypoints_6"]
        # TL=0, TR=1, BR=5, BL=4 → matches TARGET_CORNERS [TL, TR, BR, BL]
        quad = np.array([kp6[0], kp6[1], kp6[5], kp6[4]], dtype="float32")
        self.homography_matrix, _ = cv2.findHomography(quad, self.TARGET_CORNERS)
        print(f"✅ Homography ready (direct 4-corner quad from RCNN keypoints).")

    def pixel_to_meters(self, x, y):
        if self.homography_matrix is None or x is None or y is None: return None
        point = np.array([[[x, y]]], dtype="float32")
        return cv2.perspectiveTransform(point, self.homography_matrix)[0][0].tolist()

    # -------------------------------------------------------------------------
    # STEP 1: Shuttle tracking — isolated Pass 1
    # -------------------------------------------------------------------------

    def _track_shuttle_all_frames(self, vr, total_frames, batch_size=8):
        """
        Pass 1: Run TrackNet on all frames. Returns shuttle_traj, a list of:
            {"frame": int, "pos": [x_px, y_px] | None, "confidence": float}
        Logs detection rate and sample positions for verification.
        """
        shuttle_traj = []

        print(f"🏸 Pass 1: Tracking shuttle across {total_frames} frames...")

        for start_idx in range(0, total_frames, batch_size):
            end_idx = min(start_idx + batch_size, total_frames)
            actual_batch_size = end_idx - start_idx

            safe_indices = [max(0, min(total_frames - 1, idx)) for idx in range(start_idx - 1, end_idx + 1)]
            padded_frames = vr.get_batch(safe_indices).asnumpy()  # (B+2, 288, 512, 3)

            stacks = np.stack([padded_frames[j:j+3] for j in range(actual_batch_size)])  # (B, 3, 288, 512, 3)
            track_tensor = stacks.transpose(0, 1, 4, 2, 3).reshape(actual_batch_size, 9, 288, 512).astype('float32') / 255.0

            heatmaps = self.engine.predict_ball_batch(track_tensor)  # (B, 1, 288, 512)

            flat = heatmaps.reshape(actual_batch_size, -1)
            max_vals = flat.max(axis=1)
            max_idx = flat.argmax(axis=1)
            y_coords, x_coords = np.unravel_index(max_idx, (288, 512))

            for i in range(actual_batch_size):
                conf = float(max_vals[i])
                pos = [int(x_coords[i]), int(y_coords[i])] if conf > 0.5 else None
                shuttle_traj.append({"frame": start_idx + i, "pos": pos, "confidence": conf})

            if start_idx % (batch_size * 20) == 0 and start_idx > 0:
                print(f"   💨 Shuttle pass: {start_idx}/{total_frames} frames...")

        # --- Verification logging ---
        detected = sum(1 for s in shuttle_traj if s["pos"] is not None)
        missing  = total_frames - detected
        det_rate = detected / total_frames * 100 if total_frames else 0
        print(f"✅ Shuttle tracking complete: {detected}/{total_frames} frames detected ({det_rate:.1f}%), {missing} missing")

        # Print 5 evenly-spaced sample positions for manual spot-checking
        sample_indices = [int(i * (total_frames - 1) / 4) for i in range(5)]
        print("   📍 Sample shuttle positions (frame → x_px, y_px, conf):")
        for idx in sample_indices:
            s = shuttle_traj[idx]
            pos_str = f"({s['pos'][0]}, {s['pos'][1]})" if s["pos"] else "not detected"
            print(f"      frame {s['frame']:5d} → {pos_str}  conf={s['confidence']:.3f}")

        return shuttle_traj

    # -------------------------------------------------------------------------
    # Process video — calls Pass 1 first, then continues with pose inference
    # -------------------------------------------------------------------------

    def process_video(self, video_path, tracknet_batch_size=8, pose_batch_size=16, limit_frames=1800):
        self.setup_homography(video_path)

        vr = VideoReader(video_path, ctx=cpu(0), width=512, height=288)
        fps = vr.get_avg_fps()
        total_frames = min(len(vr), limit_frames) if limit_frames else len(vr)

        print(f"🚀 Starting analysis ({total_frames} frames @ {fps:.1f} fps)...")

        # --- Pass 1: Shuttle tracking (Step 1) ---
        shuttle_traj = self._track_shuttle_all_frames(vr, total_frames, tracknet_batch_size)

        # --- Pass 2: Pose inference on all frames ---
        print(f"🧍 Pass 2: Pose inference...")
        player_tracking = []

        for start_idx in range(0, total_frames, pose_batch_size):
            end_idx = min(start_idx + pose_batch_size, total_frames)
            actual_batch_size = end_idx - start_idx

            safe_indices = [max(0, min(total_frames - 1, idx)) for idx in range(start_idx - 1, end_idx + 1)]
            padded_frames = vr.get_batch(safe_indices).asnumpy()

            frames = [np.ascontiguousarray(f) for f in padded_frames[1:-1]]
            per_frame_players = self.engine.predict_pose_batch(frames)

            for i in range(actual_batch_size):
                player_tracking.append({"frame": start_idx + i, "players": per_frame_players[i]})

            if start_idx % (pose_batch_size * 20) == 0 and start_idx > 0:
                print(f"   💨 Pose pass: {start_idx}/{total_frames} frames...")

        hits = self._detect_hits_from_traj(shuttle_traj)

        return {
            "summary": {
                "durationSec": total_frames / (fps if fps > 0 else 30),
                "totalShots": len(hits),
                "shotCounts": {"Clear/Drop": len(hits)},
                "resolution": [512, 288]
            },
            "geometry": self.geometry,
            "events": hits,
            "tracking": player_tracking,
            # Step 1 debug: include raw shuttle trajectory for inspection
            "shuttle_debug": shuttle_traj,
        }

    def _detect_hits_from_traj(self, shuttle_traj):
        """Renamed from detect_hits — works from shuttle_traj list."""
        hits = []
        if len(shuttle_traj) < 5:
            return hits
        for i in range(2, len(shuttle_traj) - 2):
            curr = shuttle_traj[i]["pos"]
            prev = shuttle_traj[i-1]["pos"]
            if curr and prev:
                dy = curr[1] - prev[1]
                if i > 2 and 'dy_prev' in shuttle_traj[i-1]:
                    if shuttle_traj[i-1]['dy_prev'] > 1.0 and dy < -1.0:
                        hits.append({
                            "frame": shuttle_traj[i]["frame"],
                            "location_px": curr,
                            "location_m": self.pixel_to_meters(curr[0], curr[1]),
                            "type": "Clear/Drop"
                        })
                shuttle_traj[i]['dy_prev'] = dy
        return hits

    # Keep old name as alias so existing callers don't break
    def detect_hits(self, ball_tracking):
        return self._detect_hits_from_traj(ball_tracking)
