# worker/train/evaluate_detector.py
"""
Event-level evaluation of the trained hit detector on held-out test matches.

Frame-level F1 (train_detector.py) measures per-frame classification, but the
product metric is event detection: "a hit occurred near frame N". This script:

  1. Reads test matches from features_dir/split.txt
  2. Runs the checkpoint over every valid frame (sliding 31-frame windows)
  3. Peak-picks the probability curve (threshold + min-distance debounce)
  4. Matches peaks to annotated hit frames within a tolerance window

Serves are excluded from ground truth (the model is trained to ignore them —
build_labels marks them as negatives), so they are re-parsed from the set CSVs.

Usage:
    cd worker
    python -m train.evaluate_detector \
        --features-dir train/features_v3 \
        --checkpoint   train/hit_detector_v3.pt \
        --shuttleset-dir ../ShuttleSet/set \
        [--threshold 0.5] [--min-distance 10] [--tolerance 5]
"""
import argparse
import os
import pathlib
import sys

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from train.model import HitDetectorCNN
from train.extract_features import _parse_hit_frames

WINDOW = HitDetectorCNN.WINDOW
HALF = WINDOW // 2


def predict_probs(model: HitDetectorCNN, features: np.ndarray, valid: np.ndarray,
                  device: str, batch_size: int = 4096) -> np.ndarray:
    """Per-frame hit probability for every valid frame (0 elsewhere)."""
    n = len(features)
    probs = np.zeros(n, dtype=np.float32)
    centers = np.where(valid)[0]

    offsets = np.arange(-HALF, HALF + 1)
    model.eval()
    with torch.no_grad():
        for i in range(0, len(centers), batch_size):
            c = centers[i:i + batch_size]
            idx = np.clip(c[:, None] + offsets[None, :], 0, n - 1)
            windows = features[idx]                       # (B, 31, F)
            # Zero out-of-range / cross-span slots, same as training
            in_range = ((c[:, None] + offsets[None, :]) >= 0) & \
                       ((c[:, None] + offsets[None, :]) < n)
            windows[~in_range] = 0.0
            x = torch.from_numpy(windows).to(device)
            logits = model(x)
            probs[c] = torch.sigmoid(logits).cpu().numpy()
    return probs


def pick_peaks(probs: np.ndarray, threshold: float, min_distance: int) -> list[int]:
    """Greedy peak-picking: highest prob first, suppress neighbours."""
    candidates = np.where(probs >= threshold)[0]
    order = candidates[np.argsort(-probs[candidates])]
    taken: list[int] = []
    suppressed = np.zeros(len(probs), dtype=bool)
    for f in order:
        if not suppressed[f]:
            taken.append(int(f))
            lo, hi = max(0, f - min_distance), min(len(probs), f + min_distance + 1)
            suppressed[lo:hi] = True
    return sorted(taken)


def match_events(peaks: list[int], gt_hits: list[int], tolerance: int):
    """Greedy one-to-one matching of detections to ground truth."""
    gt_used = [False] * len(gt_hits)
    tp = 0
    for p in peaks:
        best_j, best_d = -1, tolerance + 1
        for j, g in enumerate(gt_hits):
            if not gt_used[j] and abs(p - g) < best_d:
                best_j, best_d = j, abs(p - g)
        if best_j >= 0:
            gt_used[best_j] = True
            tp += 1
    fp = len(peaks) - tp
    fn = len(gt_hits) - tp
    return tp, fp, fn


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--features-dir", required=True)
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--shuttleset-dir", required=True)
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--min-distance", type=int, default=10)
    ap.add_argument("--tolerance", type=int, default=5)
    ap.add_argument("--split", default="test", choices=["test", "val", "train"],
                    help="Which split.txt split to evaluate (tune on val, report on test)")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    ckpt = torch.load(args.checkpoint, map_location=device, weights_only=False)
    model = HitDetectorCNN(features=ckpt["features"]).to(device)
    model.load_state_dict(ckpt["model"])
    print(f"Checkpoint: {args.checkpoint} (val F1 {ckpt.get('val_f1', float('nan')):.4f})")

    feat_dir = pathlib.Path(args.features_dir)
    test_matches = [line.split(None, 1)[1].strip()
                    for line in (feat_dir / "split.txt").read_text().splitlines()
                    if line.startswith(args.split)]
    print(f"{args.split} matches: {len(test_matches)}\n")

    tot_tp = tot_fp = tot_fn = 0
    for m in test_matches:
        d = np.load(feat_dir / f"features_{m}.npz")
        features, valid = d["features"].astype(np.float32), d["valid"].astype(bool)

        all_hits, services = _parse_hit_frames(pathlib.Path(args.shuttleset_dir) / m)
        gt = sorted(set(all_hits) - services)

        probs = predict_probs(model, features, valid, device)
        peaks = pick_peaks(probs, args.threshold, args.min_distance)
        tp, fp, fn = match_events(peaks, gt, args.tolerance)
        tot_tp += tp; tot_fp += fp; tot_fn += fn

        prec = tp / max(tp + fp, 1)
        rec = tp / max(tp + fn, 1)
        print(f"{m[:60]:60s}  GT={len(gt):4d}  det={len(peaks):4d}  "
              f"P={prec:.3f}  R={rec:.3f}")

    prec = tot_tp / max(tot_tp + tot_fp, 1)
    rec = tot_tp / max(tot_tp + tot_fn, 1)
    f1 = 2 * prec * rec / max(prec + rec, 1e-9)
    print(f"\nEVENT-LEVEL (tol ±{args.tolerance} frames, th={args.threshold}, "
          f"min_dist={args.min_distance}):")
    print(f"  precision={prec:.3f}  recall={rec:.3f}  F1={f1:.3f}  "
          f"(TP={tot_tp} FP={tot_fp} FN={tot_fn})")


if __name__ == "__main__":
    main()
