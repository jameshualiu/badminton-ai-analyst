# worker/train/dataset.py
"""
HitDetectionDataset — loads pre-computed .npz feature files and builds
31-frame sliding windows entirely in memory (vectorised numpy).

Separation of concerns:
  - extract_features.py  →  produces .npz files (one per match)
  - dataset.py           →  loads .npz, samples, builds windows
  - train_detector.py    →  constructs datasets, runs training loop

Training-only dependencies: scikit-learn (for f1_score in train_detector.py)
"""
import pathlib

import numpy as np
import torch
from torch.utils.data import Dataset


# ---------------------------------------------------------------------------
# Label utilities
# ---------------------------------------------------------------------------

def build_labels(
    total_frames: int,
    hit_frames: list[int],
    radius: int = 3,
    exclude_frames: set[int] | None = None,
) -> np.ndarray:
    """
    Binary label array for every frame in one video.

    A frame t is positive (1.0) if it lies within `radius` of any hit frame
    that is NOT in `exclude_frames` (service frames).

    Args:
        total_frames:   Length of the feature array for this video.
        hit_frames:     All frame_num values from set{1,2,3}.csv.
        radius:         Half-width of the positive window around each hit.
        exclude_frames: Service frames (type == '발短球' / '발長球') to skip.

    Returns:
        (total_frames,) float32 array with 0.0 / 1.0 values.
    """
    labels  = np.zeros(total_frames, dtype=np.float32)
    exclude = exclude_frames or set()
    for hf in hit_frames:
        if hf in exclude:
            continue
        lo = max(0, hf - radius)
        hi = min(total_frames - 1, hf + radius)
        labels[lo : hi + 1] = 1.0
    return labels


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class HitDetectionDataset(Dataset):
    """
    Builds 31-frame windows from pre-computed per-frame feature arrays.

    Windows are constructed once at __init__ time using vectorised numpy
    so __getitem__ is a pure tensor lookup with zero Python overhead.

    Match boundary enforcement: window slots that would cross into a
    different match file are zero-padded (same behaviour as video boundaries).

    Args:
        npz_paths:  List of paths to features_{match_id}.npz files.
        neg_ratio:  Negative-to-positive sampling ratio for training.
                    Pass None to keep all samples (use for val/test).
        seed:       RNG seed for reproducible negative sampling.
    """
    WINDOW = 31
    HALF   = 15

    def __init__(
        self,
        npz_paths: list[pathlib.Path | str],
        neg_ratio: int | None = 5,
        seed: int = 42,
    ):
        all_features: list[np.ndarray] = []
        all_labels:   list[np.ndarray] = []
        all_valid:    list[np.ndarray] = []
        match_sizes:  list[int]        = []

        for path in npz_paths:
            d = np.load(path)
            feats = d["features"].astype(np.float32)
            all_features.append(feats)
            all_labels.append(d["labels"].astype(np.float32))
            # 'valid' marks frames inside tracked rally spans (V3 extraction);
            # legacy npz files lack it -> every frame is a candidate
            all_valid.append(d["valid"].astype(bool) if "valid" in d.files
                             else np.ones(len(feats), dtype=bool))
            match_sizes.append(len(d["labels"]))

        features = np.concatenate(all_features, axis=0)   # (N_total, F)
        labels   = np.concatenate(all_labels,   axis=0)   # (N_total,)
        valid    = np.concatenate(all_valid,    axis=0)   # (N_total,)
        N        = len(features)

        # Per-frame match index — used for boundary enforcement
        match_ids = np.empty(N, dtype=np.int32)
        cursor    = 0
        for m, sz in enumerate(match_sizes):
            match_ids[cursor : cursor + sz] = m
            cursor += sz

        # ---- negative downsampling (training only) -------------------------
        # Only frames inside tracked spans are usable samples; untracked frames
        # are all-zero features and would dilute the negative pool.
        pos_idx = np.where((labels == 1.0) & valid)[0]
        neg_idx = np.where((labels == 0.0) & valid)[0]

        if neg_ratio is not None and len(neg_idx) > 0:
            n_keep  = min(len(neg_idx), len(pos_idx) * neg_ratio)
            rng     = np.random.default_rng(seed)
            neg_idx = rng.choice(neg_idx, n_keep, replace=False)

        sel_idx = np.sort(np.concatenate([pos_idx, neg_idx]))   # (M,)
        M       = len(sel_idx)

        # ---- vectorised window construction --------------------------------
        # window_indices[i, j] = absolute frame index for window slot j of sample i
        offsets        = np.arange(-self.HALF, self.HALF + 1, dtype=np.int64)
        window_indices = sel_idx[:, None].astype(np.int64) + offsets[None, :]  # (M, 31)

        in_range   = (window_indices >= 0) & (window_indices < N)
        clamped    = np.clip(window_indices, 0, N - 1)                          # safe for indexing

        # Same-match check prevents cross-match contamination at boundaries
        same_match = (match_ids[clamped] == match_ids[sel_idx][:, None])
        valid_mask = in_range & same_match                                       # (M, 31)

        windows              = features[clamped]   # (M, 31, 5) — invalid slots gathered but zeroed next
        windows[~valid_mask] = 0.0

        self._windows = torch.from_numpy(windows)                   # (M, 31, 5)
        self._labels  = torch.from_numpy(labels[sel_idx])           # (M,)

        pos_count = int((labels[sel_idx] == 1.0).sum())
        neg_count = M - pos_count
        ratio_str = f"{neg_count / max(pos_count, 1):.1f}:1"
        print(f"  Dataset: {M:,} samples  pos={pos_count:,}  neg={neg_count:,}  ratio={ratio_str}")

    def __len__(self) -> int:
        return len(self._labels)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self._windows[idx], self._labels[idx]
