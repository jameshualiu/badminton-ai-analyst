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
        # Pre-compute court y-bounds in pixel space for shuttle sanity checks.
        # Allow 50px above the top baseline (shuttle in arc above far end) and
        # 10px below the bottom baseline. Beyond that is crowd/stands noise.
        top_ys = [kp6[0][1], kp6[1][1]]   # TL, TR
        bot_ys = [kp6[4][1], kp6[5][1]]   # BL, BR
        self.court_y_min_px = min(top_ys) - 50
        self.court_y_max_px = max(bot_ys) + 10
        print(f"✅ Homography ready. Court y-bounds in pixels: {self.court_y_min_px:.0f}–{self.court_y_max_px:.0f}")

    def _shuttle_in_court(self, pos):
        """Return False if shuttle pixel position is outside the court y-range."""
        if pos is None:
            return False
        if not hasattr(self, 'court_y_min_px'):
            return True  # no bounds computed yet, don't filter
        return self.court_y_min_px <= pos[1] <= self.court_y_max_px

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
                if not self._shuttle_in_court(pos):
                    pos = None
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

        hits_traj = self._detect_hits_from_traj(shuttle_traj)
        hits_pose = self._detect_hits_from_pose(player_tracking, shuttle_traj)
        hits = self._merge_hits(hits_traj, hits_pose)
        hits = self._classify_hits(hits, player_tracking, total_frames, shuttle_traj=shuttle_traj)

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

    def _classify_shot_rules(self, hit_frame, shuttle_map, player_at_hit=None):
        """Rule-based shot classification using post-hit shuttle trajectory and player position."""
        FRAME_H = 288.0
        SKIP = 2       # skip first N positions after gap (TrackNet noise)
        COLLECT = 10   # positions to measure post-hit trajectory

        # Gather post-hit shuttle positions
        post = []
        skipped = 0
        for fi in range(hit_frame + 1, hit_frame + 150):
            pos = shuttle_map.get(fi)
            if pos is None:
                continue
            skipped += 1
            if skipped <= SKIP:
                continue
            post.append(pos)
            if len(post) >= COLLECT:
                break

        hit_pos = shuttle_map.get(hit_frame)
        hit_y_norm = (hit_pos[1] / FRAME_H) if hit_pos else 0.5  # 0=top, 1=bottom

        # Is hitter near the net (top ~45% of frame)?
        near_net = False
        if player_at_hit:
            sk = player_at_hit.get("skeleton", [])
            lhip = sk[11] if len(sk) > 11 else None
            rhip = sk[12] if len(sk) > 12 else None
            if lhip and rhip and (lhip[0] or lhip[1]) and (rhip[0] or rhip[1]):
                hip_y_norm = ((lhip[1] + rhip[1]) / 2) / FRAME_H
                near_net = hip_y_norm < 0.45

        if len(post) < 3:
            return "Clear"

        vys = [post[i][1] - post[i - 1][1] for i in range(1, len(post))]
        vxs = [abs(post[i][0] - post[i - 1][0]) for i in range(1, len(post))]
        speeds = [(vxs[i] ** 2 + vys[i] ** 2) ** 0.5 for i in range(len(vys))]

        avg_vy = float(np.mean(vys))      # negative = moving UP (toward smaller y)
        avg_speed = float(np.mean(speeds))

        print(f"   [rules] frame={hit_frame} hit_y_norm={hit_y_norm:.2f} near_net={near_net} "
              f"avg_vy={avg_vy:.1f} avg_speed={avg_speed:.1f} post_pts={len(post)}")

        # Shuttle going UP strongly → Clear (far from net) or Lob (near net)
        if avg_vy < -6.0:
            return "Lob" if near_net else "Clear"

        # Fast + strongly downward → Smash
        if avg_speed > 14.0 and avg_vy > 4.0:
            return "Smash"

        # Fast + flat → Drive
        if avg_speed > 12.0 and abs(avg_vy) <= 4.0:
            return "Drive"

        # Moderately downward + slower → Drop
        if avg_vy > 2.0:
            return "Drop"

        # Slow and hit from mid-court height → Net shot
        if avg_speed < 6.0 and hit_y_norm < 0.55:
            return "Net"

        return "Clear"

    def _classify_hits(self, hits, player_tracking, total_frames, shuttle_traj=None):
        """Classify each hit using rule-based trajectory analysis."""
        if not hits:
            return hits

        tracking_by_frame = {entry["frame"]: entry["players"] for entry in player_tracking}

        shuttle_map = {}
        if shuttle_traj:
            for s in shuttle_traj:
                shuttle_map[s["frame"]] = s["pos"]

        for hit in hits:
            f = hit["frame"]
            shuttle_x = (hit["location_px"] or [0])[0]

            players_at_hit = tracking_by_frame.get(f, [])

            hitter = None
            if players_at_hit:
                def foot_x(p):
                    sk = p["skeleton"]
                    lx = sk[15][0] if len(sk) > 15 and sk[15] else 0
                    rx = sk[16][0] if len(sk) > 16 and sk[16] else 0
                    if lx or rx:
                        return (lx + rx) / 2
                    box = p.get("box", [])
                    return (box[0] + box[2]) / 2 if len(box) == 4 else 0
                hitter = min(players_at_hit, key=lambda p: abs(foot_x(p) - shuttle_x))

            hit["type"] = self._classify_shot_rules(f, shuttle_map, hitter)

        return hits

    def _detect_hits_from_pose(self, player_tracking, shuttle_traj):
        """Detect hits by finding peaks in player wrist velocity (COCO joints 9/10)."""
        MIN_WRIST_SPEED = 15.0  # px/frame — minimum swing speed to count as a hit
        MIN_DEBOUNCE    = 20    # frames between consecutive hits
        MATCH_RADIUS    = 100   # px — max distance to match same player between frames
        L_WRIST, R_WRIST = 9, 10

        shuttle_map      = {s["frame"]: s["pos"] for s in shuttle_traj}
        tracking_by_frame = {e["frame"]: e["players"] for e in player_tracking}
        frames = sorted(tracking_by_frame.keys())

        def player_center(p):
            box = p.get("box", [])
            if len(box) == 4:
                return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
            sk = p.get("skeleton", [])
            hl = sk[11] if len(sk) > 11 else None
            hr = sk[12] if len(sk) > 12 else None
            if hl and hr:
                return ((hl[0] + hr[0]) / 2, (hl[1] + hr[1]) / 2)
            return None

        def get_wrists(p):
            sk = p.get("skeleton", [])
            return [sk[i] for i in [L_WRIST, R_WRIST]
                    if len(sk) > i and (sk[i][0] or sk[i][1])]

        wrist_speeds = {f: 0.0 for f in frames}
        prev_players = []

        for i, f in enumerate(frames):
            curr_players = tracking_by_frame.get(f, [])

            if i > 0 and f - frames[i - 1] <= 2 and prev_players:
                max_speed = 0.0
                for cp in curr_players:
                    cc = player_center(cp)
                    if cc is None:
                        continue
                    best_pp, best_dist = None, MATCH_RADIUS
                    for pp in prev_players:
                        pc = player_center(pp)
                        if pc is None:
                            continue
                        d = ((cc[0] - pc[0]) ** 2 + (cc[1] - pc[1]) ** 2) ** 0.5
                        if d < best_dist:
                            best_dist, best_pp = d, pp
                    if best_pp is None:
                        continue
                    for cw in get_wrists(cp):
                        for pw in get_wrists(best_pp):
                            spd = ((cw[0] - pw[0]) ** 2 + (cw[1] - pw[1]) ** 2) ** 0.5
                            max_speed = max(max_speed, spd)
                wrist_speeds[f] = max_speed

            prev_players = curr_players

        hits = []
        last_hit_frame = -MIN_DEBOUNCE
        print(f"🏓 Wrist-based hit detection (threshold={MIN_WRIST_SPEED} px/frame):")

        for i in range(1, len(frames) - 1):
            f      = frames[i]
            spd      = wrist_speeds[f]
            spd_prev = wrist_speeds[frames[i - 1]]
            spd_next = wrist_speeds[frames[i + 1]]

            if spd >= MIN_WRIST_SPEED and spd > spd_prev and spd >= spd_next:
                if f - last_hit_frame >= MIN_DEBOUNCE:
                    pos = shuttle_map.get(f)
                    if pos is None:
                        for off in range(1, 15):
                            pos = shuttle_map.get(f + off) or shuttle_map.get(f - off)
                            if pos:
                                break
                    print(f"   frame {f}: wrist_speed={spd:.1f}")
                    hits.append({
                        "frame": f,
                        "location_px": list(pos) if pos else None,
                        "location_m": self.pixel_to_meters(pos[0], pos[1]) if pos else None,
                        "type": "Unknown",
                    })
                    last_hit_frame = f

        hits.sort(key=lambda h: h["frame"])
        print(f"✅ Wrist detection: {len(hits)} hits")
        return hits

    def _merge_hits(self, hits_traj, hits_pose, debounce=20, agree_window=25):
        """Cross-validate trajectory and pose hits.

        A hit confirmed by both signals (within agree_window frames) is always
        kept. A hit from only one signal is kept only if the other signal has
        NO candidate anywhere nearby — i.e. the other method simply had no data,
        not that it disagreed. This filters false positives from either source
        while preserving hits where one detector was blind.
        """
        SOLO_WRIST_SPEED_MIN = 20.0  # higher bar for unconfirmed wrist hits

        traj_frames = [h["frame"] for h in hits_traj]
        pose_frames = [h["frame"] for h in hits_pose]

        def has_nearby(frame, frame_list, window):
            return any(abs(frame - f) <= window for f in frame_list)

        accepted = []

        # Confirmed hits: pose hit has a nearby traj hit — use pose frame (more precise)
        # and prefer the shuttle position from whichever source has it.
        used_traj = set()
        for ph in hits_pose:
            close_traj = [h for h in hits_traj if abs(ph["frame"] - h["frame"]) <= agree_window]
            if close_traj:
                best = min(close_traj, key=lambda h: abs(ph["frame"] - h["frame"]))
                # Prefer shuttle position from trajectory hit if pose hit has none
                loc_px = ph.get("location_px") or best.get("location_px")
                loc_m  = ph.get("location_m")  or best.get("location_m")
                accepted.append({**ph, "location_px": loc_px, "location_m": loc_m, "confirmed": True})
                used_traj.add(best["frame"])
            # Solo pose hits: only keep if wrist speed was strong (stored in tag below)
            # — handled after traj solo pass

        # Solo traj hits: traj fired but pose had nothing nearby — keep (pose may have missed)
        for th in hits_traj:
            if th["frame"] not in used_traj and not has_nearby(th["frame"], pose_frames, agree_window):
                accepted.append({**th, "confirmed": False})

        # Solo pose hits: pose fired but traj had nothing nearby — keep only strong peaks
        for ph in hits_pose:
            if not has_nearby(ph["frame"], traj_frames, agree_window):
                accepted.append({**ph, "confirmed": False})

        # Sort and debounce, preferring confirmed hits when two are close
        accepted.sort(key=lambda h: (h["frame"], not h.get("confirmed", False)))
        merged = []
        last_frame = -debounce
        for hit in accepted:
            if hit["frame"] - last_frame >= debounce:
                merged.append(hit)
                last_frame = hit["frame"]
            elif hit.get("confirmed") and not merged[-1].get("confirmed"):
                merged[-1] = hit  # upgrade unconfirmed to confirmed

        confirmed = sum(1 for h in merged if h.get("confirmed"))
        print(f"✅ Merged: {len(merged)} hits ({confirmed} confirmed by both signals)")
        return merged

    def _detect_hits_from_traj(self, shuttle_traj):
        """Detect hits using two complementary methods.

        Primary — Gap-based: In badminton, TrackNet loses the shuttle during hits
        (fast motion, racket occlusion). A gap of 5-90 frames where the shuttle
        disappears and reappears in a new direction is the most reliable hit signal.

        Secondary — In-segment: For the minority of hits where TrackNet tracks
        through, detect direction changes within continuous tracking segments.
        """
        SEGMENT_BREAK = 4    # frames gap that splits trajectory into segments
        MIN_HIT_GAP  = 5     # frames — min gap to treat as a hit (not just noise)
        MAX_HIT_GAP  = 90    # frames — max gap (larger = play stopped, not a hit)
        MIN_DEBOUNCE = 20    # frames — minimum between consecutive accepted hits
        MIN_SPEED    = 3.0   # px/frame — minimum velocity to trust direction

        hits = []

        valid = [(s["frame"], s["pos"][0], s["pos"][1])
                 for s in shuttle_traj if s["pos"] is not None]

        det_rate = len(valid) / len(shuttle_traj) * 100 if shuttle_traj else 0
        print(f"🔍 Detection diagnostics: {len(valid)}/{len(shuttle_traj)} frames detected ({det_rate:.1f}%)")

        if len(valid) < 4:
            print("⚠️  Too few detections to find hits")
            return hits

        # Split valid detections into continuous segments
        segments = []
        seg = [valid[0]]
        for i in range(1, len(valid)):
            if valid[i][0] - valid[i - 1][0] > SEGMENT_BREAK:
                if len(seg) >= 2:
                    segments.append(seg)
                seg = [valid[i]]
            else:
                seg.append(valid[i])
        if len(seg) >= 2:
            segments.append(seg)

        print(f"📊 Segments: {len(segments)} | sizes: {[len(s) for s in segments[:20]]}")

        last_hit_frame = -MIN_DEBOUNCE

        def seg_vel_start(seg, n=3, skip=2):
            # Skip the first `skip` points — TrackNet positions right after a gap
            # are often noisy before it locks on to the shuttle again
            start = min(skip, len(seg) - 1)
            end   = min(start + n, len(seg) - 1)
            dx = seg[end][1] - seg[start][1]
            dy = seg[end][2] - seg[start][2]
            return dx, dy

        def seg_vel_end(seg, n=3):
            m = min(n, len(seg) - 1)
            dx = seg[-1][1] - seg[-1 - m][1]
            dy = seg[-1][2] - seg[-1 - m][2]
            return dx, dy

        # --- Primary: gap-based detection ---
        print("🔎 Gap analysis:")
        for i in range(len(segments) - 1):
            seg_a = segments[i]
            seg_b = segments[i + 1]

            gap_start = seg_a[-1][0]
            gap_end   = seg_b[0][0]
            gap_size  = gap_end - gap_start

            vx_a, vy_a = seg_vel_end(seg_a)
            vx_b, vy_b = seg_vel_start(seg_b)
            speed_a = (vx_a ** 2 + vy_a ** 2) ** 0.5
            speed_b = (vx_b ** 2 + vy_b ** 2) ** 0.5

            if not (MIN_HIT_GAP <= gap_size <= MAX_HIT_GAP):
                reason = f"gap={gap_size} out of [{MIN_HIT_GAP},{MAX_HIT_GAP}]"
            elif speed_a < MIN_SPEED:
                reason = f"speed_before={speed_a:.1f} < {MIN_SPEED}"
            elif speed_b < MIN_SPEED:
                reason = f"speed_after={speed_b:.1f} < {MIN_SPEED}"
            else:
                reason = "✅ HIT"
            print(f"   frames {gap_start}→{gap_end} (gap={gap_size}) spd_a={speed_a:.1f} spd_b={speed_b:.1f} → {reason}")

            if not (MIN_HIT_GAP <= gap_size <= MAX_HIT_GAP):
                continue
            if speed_a < MIN_SPEED or speed_b < MIN_SPEED:
                continue

            # Use gap_start (last seen position) as hit frame — more accurate than midpoint
            hit_frame = gap_start
            if hit_frame - last_hit_frame >= MIN_DEBOUNCE:
                hits.append({
                    "frame": hit_frame,
                    "location_px": list(seg_a[-1][1:]),
                    "location_m": self.pixel_to_meters(seg_a[-1][1], seg_a[-1][2]),
                    "type": "Unknown"
                })
                last_hit_frame = hit_frame

        # --- Secondary: in-segment direction changes ---
        # Use a 3-index window on each side so velocity is averaged over multiple
        # frames — this survives the brief deceleration at the apex of a trajectory
        # where single-frame velocity goes near-zero and misses the direction flip.
        SEG_WIN = 3
        for seg in segments:
            if len(seg) < SEG_WIN * 2 + 1:
                continue
            for k in range(SEG_WIN, len(seg) - SEG_WIN):
                f_curr, xc, yc = seg[k]
                _, xe, ye = seg[k - SEG_WIN]
                _, xl, yl = seg[k + SEG_WIN]

                vx1, vy1 = xc - xe, yc - ye   # velocity over SEG_WIN indices before
                vx2, vy2 = xl - xc, yl - yc   # velocity over SEG_WIN indices after

                speed1 = (vx1 ** 2 + vy1 ** 2) ** 0.5
                speed2 = (vx2 ** 2 + vy2 ** 2) ** 0.5

                # Scale threshold: displacement is over SEG_WIN steps now
                threshold = MIN_SPEED * SEG_WIN
                if speed1 < threshold or speed2 < threshold:
                    continue

                dot = vx1 * vx2 + vy1 * vy2
                y_rev = (vy1 > threshold and vy2 < -threshold) or \
                        (vy1 < -threshold and vy2 > threshold)

                if dot < 0 or y_rev:
                    if f_curr - last_hit_frame >= MIN_DEBOUNCE:
                        hits.append({
                            "frame": f_curr,
                            "location_px": [xc, yc],
                            "location_m": self.pixel_to_meters(xc, yc),
                            "type": "Unknown"
                        })
                        last_hit_frame = f_curr

        hits.sort(key=lambda h: h["frame"])
        return hits

    # Keep old name as alias so existing callers don't break
    def detect_hits(self, ball_tracking):
        return self._detect_hits_from_traj(ball_tracking)
