# worker/train/train_detector.py
"""
Step 2 of the hit detection training pipeline.

Loads pre-computed features_*.npz files, trains HitDetectorCNN, and exports
the best checkpoint to ONNX. Entirely decoupled from video / TrackNet.

Split: deterministic 80/11/9 by sorted npz filename (by-match, no leakage).
Val F1 (frame-level, threshold=0.4) is used for both early stopping and
ReduceLROnPlateau — recall matters more than calibration.

Training-only dependencies (not in worker/requirements.txt):
    pip install scikit-learn

Usage:
    cd worker
    python -m train.train_detector \
        --features-dir /path/to/features \
        --out-onnx     /path/to/hit_detector.onnx \
        [--epochs 50] [--batch-size 512] [--lr 1e-3]
"""
import argparse
import pathlib
import sys
import os

import numpy as np
import torch
from torch.utils.data import DataLoader
from sklearn.metrics import f1_score

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from train.model   import HitDetectorCNN, export_onnx
from train.dataset import HitDetectionDataset


TRAIN_RATIO = 0.80
VAL_RATIO   = 0.11


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train HitDetectorCNN from pre-extracted features")
    p.add_argument("--features-dir", required=True,
                   help="Directory containing features_*.npz files from extract_features.py")
    p.add_argument("--out-onnx",     required=True,
                   help="Output path for hit_detector.onnx")
    p.add_argument("--epochs",       type=int,   default=50)
    p.add_argument("--batch-size",   type=int,   default=512)
    p.add_argument("--lr",           type=float, default=1e-3)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--pos-weight",   type=float, default=5.0,
                   help="BCEWithLogitsLoss pos_weight — compensates class imbalance")
    p.add_argument("--patience",     type=int,   default=10,
                   help="Early stopping patience (epochs without val F1 improvement)")
    p.add_argument("--neg-ratio",    type=int,   default=5,
                   help="Training negative-to-positive sampling ratio")
    p.add_argument("--threshold",    type=float, default=0.4,
                   help="Probability threshold for F1 evaluation")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Train / val / test split
# ---------------------------------------------------------------------------

def split_npz_files(
    features_dir: pathlib.Path,
) -> tuple[list[pathlib.Path], list[pathlib.Path], list[pathlib.Path]]:
    """
    Deterministic 80/11/9 split on sorted features_*.npz filenames.
    Splitting by file (match) rather than by frame prevents data leakage.
    """
    all_npz = sorted(features_dir.glob("features_*.npz"))
    if not all_npz:
        raise FileNotFoundError(
            f"No features_*.npz files found in {features_dir}.\n"
            "Run extract_features.py first."
        )
    n       = len(all_npz)
    n_train = round(n * TRAIN_RATIO)
    n_val   = round(n * VAL_RATIO)
    train_f = all_npz[:n_train]
    val_f   = all_npz[n_train : n_train + n_val]
    test_f  = all_npz[n_train + n_val :]
    print(f"Split (by match): train={len(train_f)}  val={len(val_f)}  test={len(test_f)}")
    return train_f, val_f, test_f


def _write_split_file(
    features_dir: pathlib.Path,
    train_f: list[pathlib.Path],
    val_f:   list[pathlib.Path],
    test_f:  list[pathlib.Path],
) -> None:
    """Save split metadata — evaluate_detector.py reads this to find test matches."""
    split_path = features_dir / "split.txt"
    with open(split_path, "w") as fh:
        for f in train_f:
            fh.write(f"train {f.stem.removeprefix('features_')}\n")
        for f in val_f:
            fh.write(f"val   {f.stem.removeprefix('features_')}\n")
        for f in test_f:
            fh.write(f"test  {f.stem.removeprefix('features_')}\n")
    print(f"Split metadata -> {split_path}")


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def compute_val_f1(
    model:     HitDetectorCNN,
    loader:    DataLoader,
    device:    str,
    threshold: float,
) -> float:
    """
    Frame-level F1 on validation set.
    Consistent with what extract_features.py labels (±3-frame windows).
    No peak detection here — pure per-frame threshold, same as training signal.
    """
    model.eval()
    all_preds:   list[int] = []
    all_targets: list[int] = []
    with torch.no_grad():
        for x, y in loader:
            logits = model(x.to(device))
            probs  = torch.sigmoid(logits).cpu().numpy()
            all_preds.extend((probs > threshold).astype(int).tolist())
            all_targets.extend(y.numpy().astype(int).tolist())
    return float(f1_score(all_targets, all_preds, zero_division=0))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args   = _parse_args()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Training device: {device}")
    if device == "cuda":
        print(f"  GPU: {torch.cuda.get_device_name(0)}")
        print(f"  VRAM: {torch.cuda.get_device_properties(0).total_memory // 1024**3} GB")

    feat_dir = pathlib.Path(args.features_dir)
    train_files, val_files, test_files = split_npz_files(feat_dir)

    print("\nBuilding training dataset (neg_ratio={})...".format(args.neg_ratio))
    train_ds = HitDetectionDataset(train_files, neg_ratio=args.neg_ratio)

    print("Building validation dataset (no downsampling)...")
    val_ds   = HitDetectionDataset(val_files,   neg_ratio=None)

    # num_workers=0 is safest on Windows (avoids multiprocessing spawn issues)
    # On Linux/macOS, set to 4 for better throughput
    nw = 0 if sys.platform == "win32" else 4
    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, shuffle=True,
        num_workers=nw, pin_memory=(device == "cuda"),
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size, shuffle=False,
        num_workers=nw, pin_memory=(device == "cuda"),
    )

    # ---- Model setup -------------------------------------------------------
    n_features = train_ds[0][0].shape[-1]
    model    = HitDetectorCNN(features=n_features).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"\nModel: {n_params:,} parameters")

    criterion = torch.nn.BCEWithLogitsLoss(
        pos_weight=torch.tensor([args.pos_weight], device=device)
    )
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.lr, weight_decay=args.weight_decay
    )
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max", patience=5, factor=0.5
    )

    # ---- Training loop -----------------------------------------------------
    best_f1       = 0.0
    best_state    = None
    patience_left = args.patience

    header = f"{'Epoch':>5}  {'Loss':>8}  {'Val F1':>8}  {'LR':>10}"
    print(f"\n{header}")
    print("-" * len(header))

    for epoch in range(1, args.epochs + 1):
        model.train()
        epoch_loss = 0.0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()

        val_f1   = compute_val_f1(model, val_loader, device, args.threshold)
        avg_loss = epoch_loss / len(train_loader)
        lr_now   = optimizer.param_groups[0]["lr"]
        print(f"{epoch:>5}  {avg_loss:>8.4f}  {val_f1:>8.4f}  {lr_now:>10.2e}")

        scheduler.step(val_f1)

        if val_f1 > best_f1:
            best_f1       = val_f1
            best_state    = {k: v.clone() for k, v in model.state_dict().items()}
            patience_left = args.patience
            print(f"        ^ new best")
        else:
            patience_left -= 1
            if patience_left == 0:
                print(f"\nEarly stopping (best val F1 = {best_f1:.4f})")
                break

    # ---- Export ------------------------------------------------------------
    print(f"\nBest val F1: {best_f1:.4f}")
    if best_f1 < 0.75:
        print(
            "WARNING: val F1 is below the 0.75 target.\n"
            "         Consider: more epochs, lower threshold, check CSV service filtering."
        )

    model.load_state_dict(best_state)
    out_path = pathlib.Path(args.out_onnx)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Save raw weights first — ONNX export must never be able to lose the run
    ckpt_path = out_path.with_suffix(".pt")
    torch.save({"model": best_state, "features": n_features, "val_f1": best_f1}, ckpt_path)
    print(f"Checkpoint saved -> {ckpt_path}")

    export_onnx(model, str(out_path))
    print(f"ONNX exported -> {out_path}")

    _write_split_file(feat_dir, train_files, val_files, test_files)


if __name__ == "__main__":
    main()
