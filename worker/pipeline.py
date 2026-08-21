import cv2
import numpy as np
import json
from collections import Counter
from decord import VideoReader, cpu
from inference import BadmintonInference


class BadmintonPipeline:
    # Proportional x-padding applied around the court polygon when checking
    # whether a tracked shuttle position is plausibly in-play. Proportional
    # (rather than a flat pixel value) keeps tolerance consistent at both
    # the near and far ends of an angled court.
    SHUTTLE_COURT_PADDING_MIN_PX = 30.0
    SHUTTLE_COURT_PADDING_FRAC = 0.15

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

    # -------------------------------------------------------------------------
    # Homography setup
    # -------------------------------------------------------------------------

    def setup_homography(self, video_path, search_limit=150):
        vr = VideoReader(video_path, ctx=cpu(0), width=512, height=288)
        print(f"[court] Searching for court geometry...")
        for i in range(0, min(search_limit, len(vr)), 10):
            frame = vr[i].asnumpy()
            geom = self.engine.detect_geometry(frame)
            if geom.get("court_keypoints_6"):
                self.geometry = geom
                break

        if not self.geometry:
            print("WARNING:  Warning: No court found. Homography unavailable.")
            return

        kp6 = self.geometry["court_keypoints_6"]
        quad = np.array([kp6[0], kp6[1], kp6[5], kp6[4]], dtype="float32")
        self.homography_matrix, _ = cv2.findHomography(quad, self.TARGET_CORNERS)
        self.court_kp6 = kp6

        top_ys = [kp6[0][1], kp6[1][1]]
        bot_ys = [kp6[4][1], kp6[5][1]]
        self.court_y_min_px = min(top_ys) - 120
        self.court_y_max_px = max(bot_ys) + 30
        print(f"[OK] Homography ready. Court y-bounds: {self.court_y_min_px:.0f}-{self.court_y_max_px:.0f}px")

    def _shuttle_in_court(self, pos):
        """Return False if the shuttle position is implausibly far from the
        court polygon (e.g. a stray shuttlecock on the floor outside the
        sideline). Uses a perspective-correct quad test like _is_in_court,
        with x-padding proportional to the court's width at that depth so
        angled cameras aren't over- or under-filtered at the far/near end."""
        if pos is None:
            return False
        if not hasattr(self, 'court_y_min_px'):
            return True

        x, y = pos
        if not (self.court_y_min_px <= y <= self.court_y_max_px):
            return False

        kp6 = getattr(self, 'court_kp6', None)
        if not kp6:
            return True

        TL, TR = kp6[0], kp6[1]
        BL, BR = kp6[4], kp6[5]

        denom = BL[1] - TL[1]
        if abs(denom) < 1:
            return True
        t = max(0.0, min(1.0, (y - TL[1]) / denom))
        left_x = TL[0] + t * (BL[0] - TL[0])
        right_x = TR[0] + t * (BR[0] - TR[0])

        padding = max(self.SHUTTLE_COURT_PADDING_MIN_PX,
                       self.SHUTTLE_COURT_PADDING_FRAC * (right_x - left_x))

        return left_x - padding <= x <= right_x + padding

    def pixel_to_meters(self, x, y):
        if self.homography_matrix is None or x is None or y is None:
            return None
        point = np.array([[[x, y]]], dtype="float32")
        return cv2.perspectiveTransform(point, self.homography_matrix)[0][0].tolist()

    def _foot_pixel(self, player: dict):
        """Player's foot position in pixels: ankle midpoint, falling back to
        box-bottom-center. Returns (None, None) if neither is available."""
        sk = player.get("skeleton", [])
        la = sk[15] if len(sk) > 15 else None
        ra = sk[16] if len(sk) > 16 else None
        if la and ra and (la[0] or la[1]) and (ra[0] or ra[1]):
            return (la[0] + ra[0]) / 2, (la[1] + ra[1]) / 2
        box = player.get("box", [])
        if len(box) == 4:
            return (box[0] + box[2]) / 2, box[3]
        return None, None

    def _player_sort_key(self, player: dict):
        """Sort key for Top-before-Bottom ordering: court-y via homography,
        falling back to raw pixel-y when the foot position or homography is
        unavailable (matches the official BST reference's "Top before Bottom,
        comparing court y-dim" criterion)."""
        fx, fy = self._foot_pixel(player)
        if fx is not None:
            court = self.pixel_to_meters(fx, fy)
            if court is not None:
                return court[1]
        box = player.get("box", [])
        return box[1] if len(box) == 4 else 999

    def _is_in_court(self, player: dict, kp6: list, padding: float = 80.0) -> bool:
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

    def _scale_player(self, player: dict, sx: float, sy: float) -> dict:
        """Scale a player's box and skeleton by (sx, sy)."""
        box = player.get("box", [])
        skel = player.get("skeleton", [])
        return {
            **player,
            "box": [box[0]*sx, box[1]*sy, box[2]*sx, box[3]*sy] if len(box) == 4 else box,
            "skeleton": [[kp[0]*sx, kp[1]*sy] for kp in skel],
        }

    # -------------------------------------------------------------------------
    # STEP 1: Shuttle tracking -- Pass 1
    # -------------------------------------------------------------------------

    def _track_shuttle_all_frames(self, vr, total_frames, batch_size=8):
        """
        Pass 1: Run TrackNet on every frame.
        Returns shuttle_traj: list of {"frame", "pos": [x,y]|None, "confidence"}
        """
        # TrackNetV3 path: windowed inference + InpaintNet rectification
        v3_traj = self.engine.track_shuttle(vr, total_frames)
        if v3_traj is not None:
            print(f"[shuttle] Pass 1: TrackNetV3 tracked {total_frames} frames")
            for s in v3_traj:
                if not self._shuttle_in_court(s["pos"]):
                    s["pos"] = None
            self._print_traj_stats(v3_traj, total_frames)
            return v3_traj

        shuttle_traj = []
        print(f"[shuttle] Pass 1: Tracking shuttle across {total_frames} frames...")

        for start_idx in range(0, total_frames, batch_size):
            end_idx = min(start_idx + batch_size, total_frames)
            actual_batch_size = end_idx - start_idx

            safe_indices = [max(0, min(total_frames - 1, idx)) for idx in range(start_idx - 1, end_idx + 1)]
            padded_frames = vr.get_batch(safe_indices).asnumpy()

            stacks = np.stack([padded_frames[j:j+3] for j in range(actual_batch_size)])
            track_tensor = stacks.transpose(0, 1, 4, 2, 3).reshape(actual_batch_size, 9, 288, 512).astype('float32') / 255.0

            heatmaps = self.engine.predict_ball_batch(track_tensor)

            flat = heatmaps.reshape(actual_batch_size, -1)
            max_vals = flat.max(axis=1)
            max_idx = flat.argmax(axis=1)
            y_coords, x_coords = np.unravel_index(max_idx, (288, 512))

            for i in range(actual_batch_size):
                conf = float(max_vals[i])
                pos = [int(x_coords[i]), int(y_coords[i])] if conf > 0.25 else None
                if not self._shuttle_in_court(pos):
                    pos = None
                shuttle_traj.append({"frame": start_idx + i, "pos": pos, "confidence": conf})

            if start_idx % (batch_size * 20) == 0 and start_idx > 0:
                print(f"   ... Shuttle pass: {start_idx}/{total_frames} frames...")

        self._print_traj_stats(shuttle_traj, total_frames)
        return shuttle_traj

    def _print_traj_stats(self, shuttle_traj, total_frames):
        detected = sum(1 for s in shuttle_traj if s["pos"] is not None)
        det_rate = detected / total_frames * 100 if total_frames else 0
        print(f"[OK] Shuttle tracking: {detected}/{total_frames} frames ({det_rate:.1f}%)")

        sample_indices = [int(i * (total_frames - 1) / 4) for i in range(5)]
        print("   [pos] Sample positions (frame -> x, y, conf):")
        for idx in sample_indices:
            s = shuttle_traj[idx]
            pos_str = f"({s['pos'][0]}, {s['pos'][1]})" if s["pos"] else "not detected"
            print(f"      frame {s['frame']:5d} -> {pos_str}  conf={s['confidence']:.3f}")

    # -------------------------------------------------------------------------
    # Main entry point
    # -------------------------------------------------------------------------

    def process_video(self, video_path, tracknet_batch_size=8, pose_batch_size=16, limit_frames=None):
        self.setup_homography(video_path)

        vr = VideoReader(video_path, ctx=cpu(0), width=512, height=288)
        fps = vr.get_avg_fps()
        total_frames = min(len(vr), limit_frames) if limit_frames else len(vr)
        truncated = bool(limit_frames) and len(vr) > limit_frames

        print(f"[start] Starting analysis ({total_frames} frames @ {fps:.1f} fps)...")

        # Pass 1: Shuttle tracking
        shuttle_traj = self._track_shuttle_all_frames(vr, total_frames, tracknet_batch_size)

        # Pass 2: Pose inference -- use a higher-res reader so YOLO gets better
        # input quality for the far (smaller) player. TrackNet stays on vr (512x288).
        print(f"[pose] Pass 2: Pose inference (HD frames)...")
        vr_hd = VideoReader(video_path, ctx=cpu(0), width=1280, height=720)
        player_tracking = []
        kp6_raw = (self.geometry or {}).get("court_keypoints_6")

        # decord doesn't expose reader width/height directly, so derive the actual
        # decoded frame size from a sample frame rather than assuming the requested
        # size was honored exactly (unusual source aspect ratios can round differently).
        SD_H, SD_W = vr[0].asnumpy().shape[:2]
        HD_H, HD_W = vr_hd[0].asnumpy().shape[:2]
        if (SD_W, SD_H) != (512, 288):
            print(f"WARNING:  SD reader returned {SD_W}x{SD_H}, requested 512x288")
        if (HD_W, HD_H) != (1280, 720):
            print(f"WARNING:  HD reader returned {HD_W}x{HD_H}, requested 1280x720")

        # kp6 was detected on the SD reader; scale to HD for vr_hd player coords.
        # Computed unconditionally (not just when kp6_raw is present) since
        # _scale_player below needs sx/sy regardless of whether geometry was found.
        sx, sy = HD_W / SD_W, HD_H / SD_H
        kp6 = [[pt[0] * sx, pt[1] * sy] for pt in kp6_raw] if kp6_raw else None

        # Diagnostic counters
        _raw_counts = {0: 0, 1: 0, 2: 0}
        _filtered_counts = {0: 0, 1: 0, 2: 0}

        for start_idx in range(0, total_frames, pose_batch_size):
            end_idx = min(start_idx + pose_batch_size, total_frames)
            actual_batch_size = end_idx - start_idx

            safe_indices = [max(0, min(total_frames - 1, idx)) for idx in range(start_idx - 1, end_idx + 1)]
            padded_frames = vr_hd.get_batch(safe_indices).asnumpy()

            frames = [np.ascontiguousarray(f) for f in padded_frames[1:-1]]
            per_frame_players = self.engine.predict_pose_batch(frames)

            for i in range(actual_batch_size):
                players = per_frame_players[i]
                raw_n = min(len(players), 2)
                _raw_counts[raw_n] = _raw_counts.get(raw_n, 0) + 1
                if kp6:
                    players = [p for p in players if self._is_in_court(p, kp6)]
                # Keep the 2 most confident in-court detections (umpires/line
                # judges inside the padding lose to the actual players)
                players.sort(key=lambda p: -p.get("conf", 0.0))
                players = players[:2]
                filtered_n = min(len(players), 2)
                _filtered_counts[filtered_n] = _filtered_counts.get(filtered_n, 0) + 1
                # Scale HD coords back to 512x288 so downstream code stays unchanged
                players = [self._scale_player(p, 1.0 / sx, 1.0 / sy) for p in players]
                players.sort(key=self._player_sort_key)
                player_tracking.append({"frame": start_idx + i, "players": players})

            if start_idx % (pose_batch_size * 20) == 0 and start_idx > 0:
                print(f"   ... Pose pass: {start_idx}/{total_frames} frames...")

        print(f"[stats] Player detection (raw YOLO):     0={_raw_counts.get(0,0)}  1={_raw_counts.get(1,0)}  2+={_raw_counts.get(2,0)}")
        print(f"[stats] Player detection (post-filter):  0={_filtered_counts.get(0,0)}  1={_filtered_counts.get(1,0)}  2+={_filtered_counts.get(2,0)}")

        # Hit detection + classification.
        # Preferred: learned detector (CNN over trajectory windows, 93% P/R on
        # ShuttleSet test matches). Fallback: trajectory-gap + wrist heuristics.
        hits = self.engine.detect_hits(shuttle_traj) if hasattr(self.engine, "detect_hits") else None
        if hits is None:
            hits_traj = self._detect_hits_from_traj(shuttle_traj)
            hits_pose = self._detect_hits_from_pose(player_tracking, shuttle_traj)
            hits = self._merge_hits(hits_traj, hits_pose)
        hits = self._classify_hits(hits, player_tracking, shuttle_traj)

        # BST stroke classifier overrides the LSTM/rule-based "type" when loaded
        if getattr(self.engine, "bst_clf", None) is not None and hits:
            try:
                hits = self.engine.bst_clf.classify_hits(
                    hits, shuttle_traj, player_tracking, fps, self.pixel_to_meters)
            except Exception as e:
                print(f"[bst] WARNING: classify_hits failed at runtime ({e}); "
                      f"falling back to LSTM/rule-based classification")
                hits = self._classify_hits(hits, player_tracking, shuttle_traj, force_lstm=True)
            # Re-derive hit locations from BST's reliable side assignment. No-op
            # when side isn't set (e.g. the LSTM fallback path above), and kept
            # outside the try so a refine error can't discard BST's classification.
            hits = self._refine_locations_by_side(hits, player_tracking)

        shot_counts = dict(Counter(h["type"] for h in hits))

        return {
            "summary": {
                "durationSec": total_frames / (fps if fps > 0 else 30),
                "totalShots": len(hits),
                "shotCounts": shot_counts,
                "resolution": [SD_W, SD_H],
                "truncated": truncated
            },
            "geometry": self.geometry,
            "events": hits,
            "tracking": player_tracking,
            "shuttle_debug": shuttle_traj,
        }

    # -------------------------------------------------------------------------
    # Hit detection -- trajectory gaps (primary signal)
    # -------------------------------------------------------------------------

    def _detect_hits_from_traj(self, shuttle_traj):
        """
        Primary hit detection using shuttle trajectory gaps and direction changes.

        How it works per frame/segment:
          - Splits detections into continuous segments (gap > SEGMENT_BREAK = new segment).
          - PRIMARY: A gap of 8-50 frames between segments where the shuttle
            disappears and reappears in a new direction = hit event. TrackNet
            loses the shuttle during fast racket contact, so gaps are reliable.
          - SECONDARY: Within a continuous segment, detects direction reversals
            using a 3-frame velocity window on each side of a candidate frame.
        """
        SEGMENT_BREAK = 4
        MIN_HIT_GAP  = 8
        MAX_HIT_GAP  = 50
        MIN_DEBOUNCE = 20
        MIN_SPEED    = 3.0

        hits = []

        valid = [(s["frame"], s["pos"][0], s["pos"][1])
                 for s in shuttle_traj if s["pos"] is not None]

        det_rate = len(valid) / len(shuttle_traj) * 100 if shuttle_traj else 0
        print(f"[debug] Traj detection: {len(valid)}/{len(shuttle_traj)} frames ({det_rate:.1f}%)")

        if len(valid) < 4:
            print("WARNING:  Too few detections to find hits")
            return hits

        # Split into continuous segments
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

        print(f"[stats] Segments: {len(segments)} | sizes: {[len(s) for s in segments[:20]]}")

        last_hit_frame = -MIN_DEBOUNCE

        def seg_vel_start(seg, n=3, skip=2):
            start = min(skip, len(seg) - 1)
            end   = min(start + n, len(seg) - 1)
            return seg[end][1] - seg[start][1], seg[end][2] - seg[start][2]

        def seg_vel_end(seg, n=3):
            m = min(n, len(seg) - 1)
            return seg[-1][1] - seg[-1 - m][1], seg[-1][2] - seg[-1 - m][2]

        # Primary: gap-based detection
        print("[search] Gap analysis:")
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
                print(f"   frames {gap_start}->{gap_end} (gap={gap_size}) -> gap out of range")
                continue
            if speed_a < MIN_SPEED:
                print(f"   frames {gap_start}->{gap_end} (gap={gap_size}) -> speed_before={speed_a:.1f} too low")
                continue
            if speed_b < MIN_SPEED:
                print(f"   frames {gap_start}->{gap_end} (gap={gap_size}) -> speed_after={speed_b:.1f} too low")
                continue
            dot = vx_a * vx_b + vy_a * vy_b
            if dot >= 0:
                print(f"   frames {gap_start}->{gap_end} (gap={gap_size}) -> dot={dot:.1f} no reversal")
                continue
            print(f"   frames {gap_start}->{gap_end} (gap={gap_size}) -> [OK] HIT")

            hit_frame = gap_start
            if hit_frame - last_hit_frame >= MIN_DEBOUNCE:
                hits.append({
                    "frame": hit_frame,
                    "location_px": list(seg_a[-1][1:]),
                    "location_m": None,
                    "type": "Unknown"
                })
                last_hit_frame = hit_frame

        # Secondary: in-segment direction changes
        SEG_WIN = 3
        for seg in segments:
            if len(seg) < SEG_WIN * 2 + 1:
                continue
            for k in range(SEG_WIN, len(seg) - SEG_WIN):
                f_curr, xc, yc = seg[k]
                _, xe, ye = seg[k - SEG_WIN]
                _, xl, yl = seg[k + SEG_WIN]

                vx1, vy1 = xc - xe, yc - ye
                vx2, vy2 = xl - xc, yl - yc

                speed1 = (vx1 ** 2 + vy1 ** 2) ** 0.5
                speed2 = (vx2 ** 2 + vy2 ** 2) ** 0.5

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
                            "location_m": None,
                            "type": "Unknown"
                        })
                        last_hit_frame = f_curr

        hits.sort(key=lambda h: h["frame"])
        return hits

    # -------------------------------------------------------------------------
    # Hit detection -- wrist velocity peaks (secondary signal)
    # -------------------------------------------------------------------------

    def _detect_hits_from_pose(self, player_tracking, shuttle_traj):
        """
        Secondary hit detection using player wrist velocity peaks.

        Per-frame logic:
          1. Match each player to their previous-frame counterpart by closest
             bounding box center within MATCH_RADIUS px.
          2. Compute pixel distance each wrist traveled -- max across all
             wrists = wrist_speeds[frame].
          3. Scan for local peaks > MIN_WRIST_SPEED with MIN_DEBOUNCE spacing.
          4. FIX: Require shuttle within SHUTTLE_WRIST_RADIUS px of a wrist
             at impact. Kills false positives from general arm movement.
        """
        MIN_WRIST_SPEED      = 22.0
        MIN_DEBOUNCE         = 20
        MATCH_RADIUS         = 100
        SHUTTLE_WRIST_RADIUS = 80
        L_WRIST, R_WRIST     = 9, 10

        shuttle_map       = {s["frame"]: s["pos"] for s in shuttle_traj}
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
        print(f"[wrist] Wrist-based hit detection (threshold={MIN_WRIST_SPEED} px/frame):")

        for i in range(1, len(frames) - 1):
            f        = frames[i]
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

                    # Require shuttle near a wrist -- kills false positives
                    if pos is not None:
                        players_at_frame = tracking_by_frame.get(f, [])
                        shuttle_near_wrist = False
                        for p in players_at_frame:
                            for wrist in get_wrists(p):
                                dist = ((wrist[0] - pos[0]) ** 2 + (wrist[1] - pos[1]) ** 2) ** 0.5
                                if dist < SHUTTLE_WRIST_RADIUS:
                                    shuttle_near_wrist = True
                                    break
                            if shuttle_near_wrist:
                                break
                        if not shuttle_near_wrist:
                            print(f"   frame {f}: wrist_speed={spd:.1f} -- skipped (shuttle too far from wrist)")
                            continue

                    print(f"   frame {f}: wrist_speed={spd:.1f}")
                    hits.append({
                        "frame": f,
                        "location_px": list(pos) if pos else None,
                        "location_m": None,
                        "type": "Unknown",
                    })
                    last_hit_frame = f

        hits.sort(key=lambda h: h["frame"])
        print(f"[OK] Wrist detection: {len(hits)} hits")
        return hits

    # -------------------------------------------------------------------------
    # Merge hits from both signals
    # -------------------------------------------------------------------------

    def _merge_hits(self, hits_traj, hits_pose, debounce=20, agree_window=25):
        """
        Cross-validate trajectory and pose hits.

        Logic:
          - CONFIRMED: pose + trajectory agree within agree_window -> high confidence.
          - SOLO traj: no nearby pose hit -> keep (pose may have missed the player).
          - SOLO pose: no nearby traj hit -> keep (shuttle tracking may have missed gap).
          - Final debounce: prefer confirmed over unconfirmed when two land close.

        FIX: tracks used_pose set to prevent solo pose hits being added twice.
        """
        traj_frames = [h["frame"] for h in hits_traj]
        pose_frames = [h["frame"] for h in hits_pose]

        def has_nearby(frame, frame_list, window):
            return any(abs(frame - f) <= window for f in frame_list)

        accepted  = []
        used_traj = set()
        used_pose = set()

        # Pass 1: confirmed hits (both signals agree)
        for ph in hits_pose:
            close_traj = [h for h in hits_traj if abs(ph["frame"] - h["frame"]) <= agree_window]
            if close_traj:
                best   = min(close_traj, key=lambda h: abs(ph["frame"] - h["frame"]))
                loc_px = ph.get("location_px") or best.get("location_px")
                loc_m  = ph.get("location_m")  or best.get("location_m")
                accepted.append({**ph, "location_px": loc_px, "location_m": loc_m, "confirmed": True})
                used_traj.add(best["frame"])
                used_pose.add(ph["frame"])

        # Pass 2: solo trajectory hits
        for th in hits_traj:
            if th["frame"] not in used_traj and not has_nearby(th["frame"], pose_frames, agree_window):
                accepted.append({**th, "confirmed": False})

        # Pass 3: solo pose hits (FIX: skip already-paired ones)
        for ph in hits_pose:
            if ph["frame"] not in used_pose and not has_nearby(ph["frame"], traj_frames, agree_window):
                accepted.append({**ph, "confirmed": False})

        # Debounce -- prefer confirmed when two land close together
        accepted.sort(key=lambda h: (h["frame"], not h.get("confirmed", False)))
        merged = []
        last_frame = -debounce
        for hit in accepted:
            if hit["frame"] - last_frame >= debounce:
                merged.append(hit)
                last_frame = hit["frame"]
            elif hit.get("confirmed") and merged and not merged[-1].get("confirmed"):
                merged[-1] = hit

        confirmed = sum(1 for h in merged if h.get("confirmed"))
        print(f"[OK] Merged: {len(merged)} hits ({confirmed} confirmed by both signals)")
        return merged

    # -------------------------------------------------------------------------
    # Classification -- LSTM (with rule-based fallback)
    # -------------------------------------------------------------------------

    def _classify_hits(self, hits, player_tracking, shuttle_traj, force_lstm=False):
        """
        Classify each hit using the LSTM if available, rule-based otherwise.

        For LSTM: collects the skeleton sequence around each hit (15 frames
        before and after), extracts 13 COCO keypoints per frame from the
        hitter, and passes the sequence to ShotClassifierAdapter.classify().

        Key fix: locks the hitter's player index at the hit frame and uses
        that same index throughout the sequence window -- prevents swapping
        between hitter and receiver mid-sequence.

        force_lstm: bypasses the "BST will override anyway" skip below --
        used when BST is loaded but its classify_hits() call failed at
        runtime, so this becomes the fallback classification pass instead
        of the pre-BST pass.
        """
        if not hits:
            return hits

        tracking_by_frame = {entry["frame"]: entry["players"] for entry in player_tracking}
        shuttle_map = {s["frame"]: s["pos"] for s in shuttle_traj}

        COCO_SUBSET = [15, 7, 11, 13, 5, 9, 0, 16, 8, 12, 14, 6, 10]
        SEQ_BEFORE  = 15
        SEQ_AFTER   = 15

        # Skip the LSTM when BST will assign types afterwards anyway
        use_lstm = force_lstm or (
            self.engine.shot_clf is not None and getattr(self.engine, "bst_clf", None) is None)

        def foot_x(p):
            sk = p["skeleton"]
            lx = sk[15][0] if len(sk) > 15 and sk[15] else 0
            rx = sk[16][0] if len(sk) > 16 and sk[16] else 0
            if lx or rx:
                return (lx + rx) / 2
            box = p.get("box", [])
            return (box[0] + box[2]) / 2 if len(box) == 4 else 0

        for hit in hits:
            f = hit["frame"]
            shuttle_x = (hit["location_px"] or [0])[0]

            players_at_hit = tracking_by_frame.get(f, [])

            # Find hitter at hit frame and lock their index
            hitter_idx = 0
            if players_at_hit:
                hitter_idx = min(
                    range(len(players_at_hit)),
                    key=lambda i: abs(foot_x(players_at_hit[i]) - shuttle_x)
                )

            # location_m from hitter's foot position — valid court surface point
            hitter = players_at_hit[hitter_idx] if players_at_hit else None
            if hitter:
                fx, fy = self._foot_pixel(hitter)
                if fx is not None:
                    hit["location_m"] = self.pixel_to_meters(fx, fy)

            if use_lstm:
                seq = []
                for fi in range(f - SEQ_BEFORE, f + SEQ_AFTER + 1):
                    players_at_fi = tracking_by_frame.get(fi, [])

                    # Use locked index -- same player throughout entire window
                    if not players_at_fi or hitter_idx >= len(players_at_fi):
                        seq.append(None)
                        continue

                    frame_player = players_at_fi[hitter_idx]
                    sk = frame_player.get("skeleton", [])
                    kps_13 = []
                    for idx in COCO_SUBSET:
                        if idx < len(sk) and sk[idx] is not None and (sk[idx][0] != 0.0 or sk[idx][1] != 0.0):
                            kps_13.append([sk[idx][0], sk[idx][1]])
                        else:
                            kps_13.append([0.0, 0.0])
                    seq.append(kps_13)

                hit["type"] = self.engine.classify_shot(seq)

            else:
                hitter = players_at_hit[hitter_idx] if players_at_hit else None
                hit["type"] = self._classify_shot_rules(f, shuttle_map, hitter)

        return hits

    def _refine_locations_by_side(self, hits, player_tracking):
        """Re-derive location_m from BST's validated hitter `side` (Top ->
        players_at_hit[0], Bottom -> players_at_hit[1]) -- BST's full-sequence
        side assignment is far more reliable than _classify_hits' single-frame
        x-distance hitter guess used to compute location_m."""
        tracking_by_frame = {entry["frame"]: entry["players"] for entry in player_tracking}

        for hit in hits:
            side = hit.get("side")
            if side not in ("Top", "Bottom"):
                continue

            players_at_hit = tracking_by_frame.get(hit["frame"], [])
            target_idx = 0 if side == "Top" else 1
            if len(players_at_hit) <= target_idx:
                continue

            fx, fy = self._foot_pixel(players_at_hit[target_idx])
            if fx is None:
                continue

            loc = self.pixel_to_meters(fx, fy)
            if loc is not None:
                hit["location_m"] = loc

        return hits

    def _classify_shot_rules(self, hit_frame, shuttle_map, player_at_hit=None):
        """
        Fallback rule-based classifier using post-hit shuttle trajectory.

        Per-hit logic:
          1. Collect up to 10 shuttle positions after the hit frame.
             Skip first 2 found positions (TrackNet noise right after impact).
          2. Compute avg vertical velocity (avg_vy) and avg speed.
             Negative avg_vy = shuttle going UP (y decreases toward top).
          3. Check hitter hip position to determine if near net.
          4. Apply rules: Clear/Lob (up), Smash (fast+down), Drive (fast+flat),
             Drop (moderate down), Net (slow+mid-court), default Clear.

        FIX: renamed 'skipped' -> 'found' to reflect what it actually counts.
        """
        FRAME_H = 288.0
        SKIP    = 2
        COLLECT = 10

        post  = []
        found = 0
        for fi in range(hit_frame + 1, hit_frame + 150):
            pos = shuttle_map.get(fi)
            if pos is None:
                continue
            found += 1
            if found <= SKIP:
                continue
            post.append(pos)
            if len(post) >= COLLECT:
                break

        hit_pos    = shuttle_map.get(hit_frame)
        hit_y_norm = (hit_pos[1] / FRAME_H) if hit_pos else 0.5

        near_net = False
        if player_at_hit:
            sk   = player_at_hit.get("skeleton", [])
            lhip = sk[11] if len(sk) > 11 else None
            rhip = sk[12] if len(sk) > 12 else None
            if lhip and rhip and (lhip[0] or lhip[1]) and (rhip[0] or rhip[1]):
                hip_y_norm = ((lhip[1] + rhip[1]) / 2) / FRAME_H
                near_net   = hip_y_norm < 0.45

        if len(post) < 3:
            return "Clear"

        vys    = [post[i][1] - post[i - 1][1] for i in range(1, len(post))]
        vxs    = [abs(post[i][0] - post[i - 1][0]) for i in range(1, len(post))]
        speeds = [(vxs[i] ** 2 + vys[i] ** 2) ** 0.5 for i in range(len(vys))]

        avg_vy    = float(np.mean(vys))
        avg_speed = float(np.mean(speeds))

        print(f"   [rules] frame={hit_frame} hit_y_norm={hit_y_norm:.2f} near_net={near_net} "
              f"avg_vy={avg_vy:.1f} avg_speed={avg_speed:.1f} post_pts={len(post)}")

        if avg_vy < -6.0:
            return "Lob" if near_net else "Clear"
        if avg_speed > 14.0 and avg_vy > 4.0:
            return "Smash"
        if avg_speed > 12.0 and abs(avg_vy) <= 4.0:
            return "Drive"
        if avg_vy > 2.0:
            return "Drop"
        if avg_speed < 6.0 and hit_y_norm < 0.55:
            return "Net"
        return "Clear"

    # Keep old name as alias so existing callers don't break
    def detect_hits(self, ball_tracking):
        return self._detect_hits_from_traj(ball_tracking)