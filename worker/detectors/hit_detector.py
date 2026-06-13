"""Learned hit detection over TrackNetV3 shuttle trajectories.

Replaces the heuristic trajectory-gap / wrist-velocity hit detection with a
1D-CNN (train/model.py HitDetectorCNN) trained on ShuttleSet hit annotations.
Held-out test performance: 93.3% precision / 93.8% recall at ±5 frames.

Input is the per-frame trajectory produced by TrackNetV3Adapter.track_video;
features must match worker/train/extract_features.py exactly:
    [conf, x/512, y/288, vx/512, vy/288, visible, inpainted]
"""

import numpy as np

WINDOW = 31
HALF = WINDOW // 2
# Operating point tuned on ShuttleSet validation matches (evaluate_detector.py)
PEAK_THRESHOLD = 0.7
PEAK_MIN_DISTANCE = 10


def build_features(shuttle_traj: list) -> np.ndarray:
    """(N, 7) float32 feature array from a trajectory list."""
    n = len(shuttle_traj)
    feats = np.zeros((n, 7), dtype=np.float32)
    xs = np.zeros(n, dtype=np.float32)
    ys = np.zeros(n, dtype=np.float32)
    vis = np.zeros(n, dtype=np.float32)

    for i, s in enumerate(shuttle_traj):
        feats[i, 0] = s.get("confidence", 0.0)
        if s.get("pos") is not None:
            xs[i], ys[i] = s["pos"]
            vis[i] = 1.0
            feats[i, 6] = 1.0 if s.get("inpainted") else 0.0

    vx = np.zeros(n, dtype=np.float32)
    vy = np.zeros(n, dtype=np.float32)
    both = (vis[1:] > 0) & (vis[:-1] > 0)
    vx[1:][both] = (xs[1:] - xs[:-1])[both]
    vy[1:][both] = (ys[1:] - ys[:-1])[both]

    feats[:, 1] = xs / 512.0
    feats[:, 2] = ys / 288.0
    feats[:, 3] = vx / 512.0
    feats[:, 4] = vy / 288.0
    feats[:, 5] = vis
    return feats


class HitDetectorAdapter:
    """Runs hit_detector_v3.onnx over a shuttle trajectory."""

    def __init__(self, weights_path: str):
        import onnxruntime as ort
        self._session = ort.InferenceSession(
            weights_path,
            providers=["CPUExecutionProvider"],
        )
        self._input_name = self._session.get_inputs()[0].name
        print(f"[hitnet] HitDetectorAdapter loaded: {weights_path}")

    def predict_probs(self, features: np.ndarray, batch_size: int = 2048) -> np.ndarray:
        """Per-frame hit probability via sliding 31-frame windows."""
        n = len(features)
        probs = np.zeros(n, dtype=np.float32)
        offsets = np.arange(-HALF, HALF + 1)
        for start in range(0, n, batch_size):
            c = np.arange(start, min(start + batch_size, n))
            raw_idx = c[:, None] + offsets[None, :]
            idx = np.clip(raw_idx, 0, n - 1)
            windows = features[idx]                      # (B, 31, 7)
            windows[(raw_idx < 0) | (raw_idx >= n)] = 0.0  # zero-pad edges, as in training
            out = self._session.run(None, {self._input_name: windows})[0]  # (B, 1)
            probs[c] = out[:, 0]
        return probs

    def detect(self, shuttle_traj: list) -> list:
        """Detect hit events. Returns pipeline-format hit dicts."""
        if len(shuttle_traj) < WINDOW:
            return []

        features = build_features(shuttle_traj)
        probs = self.predict_probs(features)

        # Greedy peak-picking: strongest peaks first, suppress neighbours
        n = len(probs)
        candidates = np.where(probs >= PEAK_THRESHOLD)[0]
        order = candidates[np.argsort(-probs[candidates])]
        suppressed = np.zeros(n, dtype=bool)
        peaks = []
        for f in order:
            if not suppressed[f]:
                peaks.append(int(f))
                lo = max(0, f - PEAK_MIN_DISTANCE)
                suppressed[lo:f + PEAK_MIN_DISTANCE + 1] = True
        peaks.sort()

        # Build hit dicts; location from nearest visible trajectory point
        hits = []
        for f in peaks:
            pos = None
            for d in range(0, 6):
                for cand in (f - d, f + d):
                    if 0 <= cand < n and shuttle_traj[cand].get("pos") is not None:
                        pos = list(shuttle_traj[cand]["pos"])
                        break
                if pos is not None:
                    break
            hits.append({
                "frame": f,
                "location_px": pos,
                "confidence": float(probs[f]),
                "confirmed": True,
                "source": "hitnet",
            })

        print(f"[hitnet] {len(hits)} hits detected (th={PEAK_THRESHOLD}, "
              f"min_dist={PEAK_MIN_DISTANCE})")
        return hits
