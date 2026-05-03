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

    def _is_in_court(self, player: dict, kp6: list, padding: float = 20.0) -> bool:
        """Return True if player's ankle midpoint is inside the court polygon."""
        skel = player.get("skeleton", [])
        box  = player.get("box", [])

        la = skel[15] if len(skel) > 15 else None
        ra = skel[16] if len(skel) > 16 else None

        if la and ra and (la[0] or la[1]) and (ra[0] or ra[1]):
            ax = (la[0] + ra[0]) / 2
            ay = (la[1] + ra[1]) / 2
        elif box and len(box) == 4:
            ax = (box[0] + box[2]) / 2
            ay = box[3]
        else:
            return False

        TL, TR = kp6[0], kp6[1]
        BL, BR = kp6[4], kp6[5]

        if ay < TL[1] - padding or ay > BL[1] + padding:
            return False

        denom = BL[1] - TL[1]
        if abs(denom) < 1:
            return False
        t = (ay - TL[1]) / denom
        left_x  = TL[0] + t * (BL[0] - TL[0])
        right_x = TR[0] + t * (BR[0] - TR[0])

        return left_x - padding <= ax <= right_x + padding

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
        kp6 = (self.geometry or {}).get("court_keypoints_6")

        for start_idx in range(0, total_frames, pose_batch_size):
            end_idx = min(start_idx + pose_batch_size, total_frames)
            actual_batch_size = end_idx - start_idx

            safe_indices = [max(0, min(total_frames - 1, idx)) for idx in range(start_idx - 1, end_idx + 1)]
            padded_frames = vr.get_batch(safe_indices).asnumpy()

            frames = [np.ascontiguousarray(f) for f in padded_frames[1:-1]]
            per_frame_players = self.engine.predict_pose_batch(frames)

            for i in range(actual_batch_size):
                players = per_frame_players[i]
                if kp6:
                    players = [p for p in players if self._is_in_court(p, kp6)]
                player_tracking.append({"frame": start_idx + i, "players": players})

            if start_idx % (pose_batch_size * 20) == 0 and start_idx > 0:
                print(f"   💨 Pose pass: {start_idx}/{total_frames} frames...")

        hits = self._detect_hits_from_traj(shuttle_traj)
        hits = self._classify_hits(hits, player_tracking, total_frames)

        from collections import Counter
        shot_counts = dict(Counter(h["type"] for h in hits))

        return {
            "summary": {
                "durationSec": total_frames / (fps if fps > 0 else 30),
                "totalShots": len(hits),
                "shotCounts": shot_counts,
                "resolution": [512, 288]
            },
            "geometry": self.geometry,
            "events": hits,
            "tracking": player_tracking,
            # Step 1 debug: include raw shuttle trajectory for inspection
            "shuttle_debug": shuttle_traj,
        }

    def _classify_hits(self, hits, player_tracking, total_frames):
        """Classify each hit using the LSTM shot classifier."""
        if not hits:
            return hits

        # COCO 17 → 13 keypoints: drop eyes (1,2) and ears (3,4)
        COCO_SUBSET = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
        WINDOW = 20  # ±20 frames = up to 41 total

        tracking_by_frame = {entry["frame"]: entry["players"] for entry in player_tracking}

        for hit in hits:
            f = hit["frame"]
            shuttle_x = (hit["location_px"] or [0])[0]

            # Pick hitter: player whose ankle midpoint is closest to shuttle x
            hitter_id = None
            players_at_hit = tracking_by_frame.get(f, [])
            if players_at_hit:
                def foot_x(p):
                    sk = p["skeleton"]
                    lx = sk[15][0] if len(sk) > 15 and sk[15] else 0
                    rx = sk[16][0] if len(sk) > 16 and sk[16] else 0
                    if lx or rx:
                        return (lx + rx) / 2
                    box = p.get("box", [])
                    return (box[0] + box[2]) / 2 if len(box) == 4 else 0
                hitter_id = min(players_at_hit, key=lambda p: abs(foot_x(p) - shuttle_x))["id"]

            # Build skeleton window of up to 41 frames
            frame_range = range(max(0, f - WINDOW), min(total_frames, f + WINDOW + 1))
            seq = []
            for fi in frame_range:
                players = tracking_by_frame.get(fi, [])
                player = next((p for p in players if p["id"] == hitter_id), players[0] if players else None)
                if player:
                    sk = player["skeleton"]
                    kps = [sk[i] for i in COCO_SUBSET]
                else:
                    kps = None
                seq.append(kps)

            hit["type"] = self.engine.classify_shot(seq)

        return hits

    def _detect_hits_from_traj(self, shuttle_traj):
        """Detect hits via velocity direction change on the shuttle trajectory.

        Requirements for a valid hit:
        - Both surrounding velocity vectors exceed MIN_SPEED (filters jitter)
        - The dot product of the two vectors is negative (>90° direction change)
          OR there is a sign reversal in the dominant Y component
        - At least MIN_GAP frames since the last accepted hit (debounce)
        - No large tracking gap (>MAX_FRAME_GAP missing frames) on either side
        """
        MIN_SPEED = 5.0      # px/frame — below this is noise / stationary
        MIN_GAP = 20         # frames — minimum spacing between accepted hits
        MAX_FRAME_GAP = 6    # frames — skip if tracking lost for too long nearby

        hits = []

        # Collect only frames where the shuttle was confidently detected
        valid = [(s["frame"], s["pos"][0], s["pos"][1])
                 for s in shuttle_traj if s["pos"] is not None]

        if len(valid) < 3:
            return hits

        last_hit_frame = -MIN_GAP

        for k in range(1, len(valid) - 1):
            f_prev, xp, yp = valid[k - 1]
            f_curr, xc, yc = valid[k]
            f_next, xn, yn = valid[k + 1]

            # Skip if surrounding detections are too far apart
            if f_curr - f_prev > MAX_FRAME_GAP or f_next - f_curr > MAX_FRAME_GAP:
                continue

            vx1, vy1 = xc - xp, yc - yp
            vx2, vy2 = xn - xc, yn - yc

            speed1 = (vx1 ** 2 + vy1 ** 2) ** 0.5
            speed2 = (vx2 ** 2 + vy2 ** 2) ** 0.5

            if speed1 < MIN_SPEED or speed2 < MIN_SPEED:
                continue

            dot = vx1 * vx2 + vy1 * vy2
            # Detect both down→up AND up→down reversals
            y_reversal = (vy1 > MIN_SPEED and vy2 < -MIN_SPEED) or \
                         (vy1 < -MIN_SPEED and vy2 > MIN_SPEED)

            if dot < 0 or y_reversal:
                if f_curr - last_hit_frame < MIN_GAP:
                    continue
                hits.append({
                    "frame": f_curr,
                    "location_px": [xc, yc],
                    "location_m": self.pixel_to_meters(xc, yc),
                    "type": "Unknown"
                })
                last_hit_frame = f_curr

        return hits

    # Keep old name as alias so existing callers don't break
    def detect_hits(self, ball_tracking):
        return self._detect_hits_from_traj(ball_tracking)
