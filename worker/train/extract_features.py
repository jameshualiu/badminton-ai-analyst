# worker/train/extract_features.py
"""
Step 1 of the hit detection training pipeline.

For each match in ShuttleSet (44 total):
  1. Read YouTube URL from match.csv
  2. Download the video with yt-dlp (background thread pre-fetches the next)
  3. Decode via decord.VideoReader at 512x288 (avoids CPU bottleneck)
  4. Run TrackNetAdapter.predict_batch at high batch size (RTX 2060 / 6 GB VRAM)
  5. Compute per-frame features: [confidence, x/512, y/288, vx/512, vy/288]
  6. Parse set{1,2,3}.csv for ground-truth hit frames
  7. Exclude serve frames (Chinese types: '發短球' / '發長球')
  8. Build binary labels with a +/-3 frame positive window
  9. Save features_{match_id}.npz; delete the .mp4 immediately

ShuttleSet layout (all files under ShuttleSet/set/):
    match.csv        — one row per match; 'video' column = match folder name, 'url' = YouTube
    homography.csv   — one row per match; corner pixel coords for court y-bounds
    <folder>/        — named by the 'video' column, contains set1/2/3.csv

Concurrency model: one background thread downloads the NEXT video while the
GPU processes the CURRENT one. Queue(maxsize=1) guarantees at most two videos
on disk simultaneously — safe for limited storage.

Training-only dependencies (not in worker/requirements.txt):
    pip install yt-dlp pandas

Usage:
    cd worker
    python -m train.extract_features \
        --shuttleset-dir ShuttleSet/set \
        --match-csv      ShuttleSet/set/match.csv \
        --homography-csv ShuttleSet/set/homography.csv \
        --tracknet-weights /models/ball_track.pt \
        --out-dir        /path/to/features \
        [--batch-size 32] \
        [--match Kento_MOMOTA_CHOU_Tien_Chen_Fuzhou_Open_2019_Finals]
"""
import argparse
import os
import pathlib
import queue
import sys
import tempfile
import threading
import time

# torch must be imported (via court_detector) BEFORE decord — decord loads CUDA
# DLLs that conflict with PyTorch's c10.dll if decord is imported first.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from detectors.court_detector import TrackNetAdapter
from train.dataset import build_labels

import numpy as np
import pandas as pd
from decord import VideoReader, cpu

# Service-type labels as they appear in ShuttleSet CSVs (traditional Chinese)
SERVICE_TYPES_ZH = {"發短球", "發長球"}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extract TrackNet features from ShuttleSet")
    p.add_argument("--shuttleset-dir",   required=True,
                   help="ShuttleSet/set directory — contains match subdirectories")
    p.add_argument("--match-csv",        required=True,
                   help="ShuttleSet/set/match.csv — has 'video' (folder name) and 'url' columns")
    p.add_argument("--homography-csv",   required=True,
                   help="ShuttleSet/set/homography.csv — single file with court corners for all matches")
    p.add_argument("--tracknet-weights", default=None,
                   help="Path to legacy ball_track.pt (ignored when --tracknet-v3-weights is set)")
    p.add_argument("--tracknet-v3-weights", default=None,
                   help="Path to TrackNetV3 TrackNet_best.pt — enables the V3 extraction path "
                        "(rally-span limited, 7 features incl. visibility/inpainted flags)")
    p.add_argument("--inpaintnet-weights", default=None,
                   help="Path to InpaintNet_best.pt (optional, V3 path only)")
    p.add_argument("--rally-pad", type=int, default=90,
                   help="Frames of context tracked before/after each rally's hit span (V3 path)")
    p.add_argument("--out-dir",          required=True,
                   help="Output directory for features_*.npz files")
    p.add_argument("--tmp-dir",          default=None,
                   help="Temp dir for downloaded videos (default: system temp)")
    p.add_argument("--video-dir",        default=None,
                   help="Directory of pre-downloaded videos named <match_id>.mp4. "
                        "Skips yt-dlp download for any match whose file exists here.")
    p.add_argument("--batch-size",       type=int, default=32,
                   help="TrackNet inference batch size. RTX 2060: 32 is safe, 64 may work")
    p.add_argument("--frame-stride",     type=int, default=1,
                   help="Process every Nth frame (e.g. 2 = halve inference calls). "
                        "Label radius is auto-scaled so the hit window stays ~6 original frames wide.")
    p.add_argument("--match",            default=None,
                   help="Process one match by folder name — for testing")
    return p.parse_args()


# ---------------------------------------------------------------------------
# match.csv loading with flexible column detection
# ---------------------------------------------------------------------------

def _load_match_csv(csv_path: str) -> pd.DataFrame:
    """
    Load ShuttleSet match.csv and normalise to _match_id / _url columns.

    ShuttleSet match.csv has:
      'video' — match folder name (e.g. Kento_MOMOTA_CHOU_Tien_Chen_Fuzhou_Open_2019_Finals)
      'url'   — YouTube URL
      'id'    — serial number 1-44 (NOT the folder name)

    _match_id is set to the 'video' column so it maps directly to the match directory.
    Rows with a missing or empty URL are skipped (match 12 has no URL in ShuttleSet).
    """
    df   = pd.read_csv(csv_path)
    cols = [c.lower().strip() for c in df.columns]

    # 'video' column = folder name; prefer it over 'id' which is just a serial number
    for candidate in ("video", "match_id", "folder", "name"):
        if candidate in cols:
            df = df.rename(columns={df.columns[cols.index(candidate)]: "_match_id"})
            break
    else:
        df = df.rename(columns={df.columns[0]: "_match_id"})

    # URL column
    for candidate in ("url", "video_url", "youtube_url", "link"):
        if candidate in cols:
            df = df.rename(columns={df.columns[cols.index(candidate)]: "_url"})
            break
    else:
        for orig_col in df.columns:
            if df[orig_col].astype(str).str.contains(r"youtube\.com|youtu\.be", na=False).any():
                df = df.rename(columns={orig_col: "_url"})
                break
        else:
            raise ValueError(
                f"Cannot find URL column in {csv_path}.\n"
                f"Found columns: {list(df.columns)}"
            )

    df["_match_id"] = df["_match_id"].astype(str).str.strip()
    df["_url"]      = df["_url"].astype(str).str.strip()

    # Drop rows with no URL (e.g. match 12 in ShuttleSet).
    # Note: pandas 'str' dtype preserves real NaN through astype(str), so
    # check isna() as well as the legacy string forms.
    missing = df["_url"].isna() | df["_url"].isin(["", "nan", "None"])
    if missing.any():
        print(f"[init] Skipping {missing.sum()} match(es) with no YouTube URL")
        df = df[~missing]

    return df[["_match_id", "_url"]]


# ---------------------------------------------------------------------------
# Video download
# ---------------------------------------------------------------------------

def _download_video(url: str, out_path: pathlib.Path) -> bool:
    """
    Download one video with yt-dlp. Outputs an mp4 at out_path.
    Returns True on success, False on any error.
    """
    try:
        import yt_dlp
    except ImportError:
        raise ImportError(
            "yt-dlp is required for feature extraction.\n"
            "Install with: pip install yt-dlp"
        )

    if out_path.exists():
        out_path.unlink()

    ydl_opts = {
        # Prefer a pre-muxed mp4 so ffmpeg is never needed.
        # Falls back to any single-file format ≤720p if no muxed mp4 exists.
        "format":   "best[height<=720][ext=mp4]/best[height<=720]/best",
        "outtmpl":  str(out_path),
        "quiet":    True,
        "no_warnings": True,
        "ignoreerrors": False,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return out_path.exists()
    except Exception as exc:
        print(f"   [yt-dlp error] {exc}")
        return False


# ---------------------------------------------------------------------------
# ShuttleSet CSV parsing
# ---------------------------------------------------------------------------

def _parse_hit_frames(match_dir: pathlib.Path) -> tuple[list[int], set[int]]:
    """
    Read set1/2/3.csv and return (all_hit_frames, service_frames).

    hit_frames  : every frame_num in the CSVs (positive label candidates)
    service_frames : subset whose 'type' column is a Chinese service type —
                     these are EXCLUDED from positive labels but can be negatives.

    CSVs may be UTF-8 or UTF-8-BOM encoded (handles both).
    """
    all_hits: list[int] = []
    services: set[int]  = set()

    for csv_name in ("set1.csv", "set2.csv", "set3.csv"):
        csv_path = match_dir / csv_name
        if not csv_path.exists():
            continue

        try:
            df = pd.read_csv(csv_path, encoding="utf-8")
        except UnicodeDecodeError:
            df = pd.read_csv(csv_path, encoding="utf-8-sig")

        if "frame_num" not in df.columns:
            print(f"   WARNING: {csv_name} has no frame_num column — skipping")
            continue

        type_col = "type" if "type" in df.columns else None
        for _, row in df.iterrows():
            if pd.isna(row["frame_num"]):
                continue
            fn = int(row["frame_num"])
            all_hits.append(fn)
            if type_col and str(row[type_col]).strip() in SERVICE_TYPES_ZH:
                services.add(fn)

    return all_hits, services


def _load_homography(homography_csv: pathlib.Path) -> pd.DataFrame:
    """
    Load the global ShuttleSet/set/homography.csv once and return it.

    Columns used: 'video', 'upleft_y', 'upright_y', 'downleft_y', 'downright_y'
    """
    return pd.read_csv(homography_csv)


def _court_y_bounds(
    homography_df: pd.DataFrame,
    video_name: str,
) -> tuple[float, float] | None:
    """
    Derive pixel y-bounds for one match from the global homography DataFrame.

    ShuttleSet homography.csv has one row per match with exact court corner
    pixel coordinates. We take the min/max of the four y values and add the
    same padding used in pipeline.py (−120 top, +30 bottom).

    Returns None if the match isn't found — caller skips y-bound filtering.
    """
    row = homography_df[homography_df["video"] == video_name]
    if row.empty:
        print(f"   WARNING: {video_name} not found in homography.csv — skipping y-filter")
        return None
    try:
        r  = row.iloc[0]
        ys = [float(r["upleft_y"]), float(r["upright_y"]),
              float(r["downleft_y"]), float(r["downright_y"])]
        return min(ys) - 120.0, max(ys) + 30.0
    except Exception as exc:
        print(f"   WARNING: could not read y-bounds for {video_name}: {exc}")
        return None


# ---------------------------------------------------------------------------
# Feature extraction (GPU-heavy section)
# ---------------------------------------------------------------------------

def _extract_features(
    video_path: pathlib.Path,
    tracknet: TrackNetAdapter,
    y_bounds: tuple[float, float] | None,
    batch_size: int,
    frame_stride: int = 1,
) -> np.ndarray:
    """
    Run TrackNet on every (frame_stride)-th frame and return (N, 5) float32 features.

    Feature layout per sampled frame:
        [confidence, x/512, y/288, vx/512, vy/288]

    Undetected frames (confidence <= 0.25 or outside court y-bounds) are zeros.
    Velocity is the position delta between consecutive sampled frames (scaled by
    1/frame_stride so the magnitude stays comparable to stride=1 features).
    """
    vr    = VideoReader(str(video_path), ctx=cpu(0), width=512, height=288)
    total = len(vr)
    fps   = vr.get_avg_fps()

    # Indices of frames we will actually run TrackNet on
    centers = list(range(0, total, frame_stride))
    n       = len(centers)
    print(f"   Video: {total} frames @ {fps:.1f} fps  stride={frame_stride}  → {n} inference frames")

    raw_conf = np.zeros(n, dtype=np.float32)
    raw_x    = np.zeros(n, dtype=np.float32)
    raw_y    = np.zeros(n, dtype=np.float32)
    detected = np.zeros(n, dtype=bool)

    y_min = y_bounds[0] if y_bounds else -1e9
    y_max = y_bounds[1] if y_bounds else  1e9

    for batch_start in range(0, n, batch_size):
        batch_centers = centers[batch_start : batch_start + batch_size]
        bs = len(batch_centers)

        # For each center frame read its prev/next neighbours for the triplet.
        # Reads are still sequential within each small window → decord stays fast.
        idx_list = []
        for c in batch_centers:
            idx_list.extend([
                max(0, c - 1),
                c,
                min(total - 1, c + 1),
            ])

        raw_frames = vr.get_batch(idx_list).asnumpy()   # (bs*3, H, W, 3)

        # Build (bs, 3, H, W, 3) then → (bs, 9, 288, 512)
        stacks = np.stack([raw_frames[j * 3 : j * 3 + 3] for j in range(bs)])
        tensor = (stacks.transpose(0, 1, 4, 2, 3)
                        .reshape(bs, 9, 288, 512)
                        .astype("float32") / 255.0)

        heatmaps = tracknet.predict_batch(tensor)        # (bs, 1, 288, 512)
        flat     = heatmaps.reshape(bs, -1)
        maxv     = flat.max(axis=1)
        maxi     = flat.argmax(axis=1)
        ys, xs   = np.unravel_index(maxi, (288, 512))

        for i in range(bs):
            si   = batch_start + i
            conf = float(maxv[i])
            if conf > 0.25 and y_min <= float(ys[i]) <= y_max:
                raw_conf[si] = conf
                raw_x[si]    = float(xs[i])
                raw_y[si]    = float(ys[i])
                detected[si] = True

        if batch_start > 0 and batch_start % (batch_size * 50) == 0:
            pct = batch_start / n * 100
            print(f"   ... {batch_start}/{n} inference frames ({pct:.0f}%)")

    # Velocity between consecutive sampled frames; divide by stride so the
    # magnitude is in px-per-original-frame (same scale as stride=1).
    vx = np.zeros(n, dtype=np.float32)
    vy = np.zeros(n, dtype=np.float32)
    for i in range(1, n):
        if detected[i] and detected[i - 1]:
            vx[i] = (raw_x[i] - raw_x[i - 1]) / frame_stride
            vy[i] = (raw_y[i] - raw_y[i - 1]) / frame_stride

    det_rate = detected.sum() / n * 100
    print(f"   TrackNet detection rate: {det_rate:.1f}%")

    return np.stack([
        raw_conf,
        raw_x / 512.0,
        raw_y / 288.0,
        vx    / 512.0,
        vy    / 288.0,
    ], axis=1).astype(np.float32)   # (n, 5)


# ---------------------------------------------------------------------------
# TrackNetV3 feature extraction (rally spans only)
# ---------------------------------------------------------------------------

V3_FEATURES = 7   # [conf, x/512, y/288, vx/512, vy/288, visible, inpainted]


def _rally_spans(hit_frames: list[int], total_frames: int,
                 pad: int = 90, gap: int = 150) -> list[list[int]]:
    """Cluster annotated hit frames into rally spans.

    Consecutive hits closer than `gap` frames (~5 s @ 30 fps) belong to the
    same rally. Each span is padded by `pad` frames of context and overlapping
    spans are merged.
    """
    spans: list[list[int]] = []
    for f in sorted(hit_frames):
        if spans and f - spans[-1][1] <= gap:
            spans[-1][1] = f
        else:
            spans.append([f, f])

    merged: list[list[int]] = []
    for s, e in spans:
        s, e = max(0, s - pad), min(total_frames - 1, e + pad)
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return merged


class _SpanReader:
    """Expose frames [start, start+n) of a decord VideoReader as 0-based."""

    def __init__(self, vr, start: int):
        self.vr = vr
        self.start = start

    def get_batch(self, indices):
        return self.vr.get_batch([self.start + i for i in indices])


def _extract_features_v3(
    video_path: pathlib.Path,
    v3,                                   # TrackNetV3Adapter
    batch_size: int,
    spans: list[list[int]],
    total: int,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Run TrackNetV3 over rally spans only. Returns:
        features: (total, 7) float32 — zeros outside spans
        valid:    (total,) bool — True inside tracked spans

    No court y-bounds filter here (unlike the legacy path): homography.csv is
    in 1280x720 annotation space while local videos vary in resolution, and
    clears/lifts legitimately fly above the court's top line. V3's median-
    background input + InpaintNet thresholding already suppress off-court
    false positives.
    """
    vr = VideoReader(str(video_path), ctx=cpu(0), width=512, height=288)

    features = np.zeros((total, V3_FEATURES), dtype=np.float32)
    valid = np.zeros(total, dtype=bool)

    span_frames = sum(e - s + 1 for s, e in spans)
    print(f"   {len(spans)} rally spans, {span_frames:,}/{total:,} frames "
          f"({span_frames / total * 100:.0f}%) to track")

    t0 = time.time()
    for si, (s, e) in enumerate(spans):
        n = e - s + 1
        traj = v3.track_video(_SpanReader(vr, s), n, batch_size)

        xs   = np.zeros(n, dtype=np.float32)
        ys   = np.zeros(n, dtype=np.float32)
        vis  = np.zeros(n, dtype=np.float32)
        inp  = np.zeros(n, dtype=np.float32)
        conf = np.zeros(n, dtype=np.float32)
        for t in traj:
            i = t["frame"]
            conf[i] = t["confidence"]
            if t["pos"] is not None:
                xs[i], ys[i] = t["pos"]
                vis[i] = 1.0
                inp[i] = 1.0 if t.get("inpainted") else 0.0

        vx = np.zeros(n, dtype=np.float32)
        vy = np.zeros(n, dtype=np.float32)
        both = (vis[1:] > 0) & (vis[:-1] > 0)
        vx[1:][both] = (xs[1:] - xs[:-1])[both]
        vy[1:][both] = (ys[1:] - ys[:-1])[both]

        features[s:e + 1] = np.stack([
            conf, xs / 512.0, ys / 288.0, vx / 512.0, vy / 288.0, vis, inp,
        ], axis=1)
        valid[s:e + 1] = True

        if (si + 1) % 10 == 0 or si == len(spans) - 1:
            done = sum(b - a + 1 for a, b in spans[:si + 1])
            fps = done / max(time.time() - t0, 1e-6)
            print(f"   ... span {si + 1}/{len(spans)}  ({done:,} frames, {fps:.0f} fps)")

    in_span_vis = features[valid, 5].mean() * 100 if valid.any() else 0.0
    print(f"   V3 visibility inside spans: {in_span_vis:.1f}%")
    return features, valid


# ---------------------------------------------------------------------------
# Per-match orchestration
# ---------------------------------------------------------------------------

def _process_match(
    match_id:      str,
    match_dir:     pathlib.Path,
    video_path:    pathlib.Path,
    tracknet,      # TrackNetAdapter | TrackNetV3Adapter
    out_dir:       pathlib.Path,
    batch_size:    int,
    homography_df: pd.DataFrame,
    frame_stride:  int = 1,
    use_v3:        bool = False,
    rally_pad:     int = 90,
) -> bool:
    out_path = out_dir / f"features_{match_id}.npz"

    if not match_dir.exists():
        print(f"[skip] {match_id}: match dir not found at {match_dir}")
        return False

    hit_frames, service_frames = _parse_hit_frames(match_dir)
    if not hit_frames:
        print(f"[skip] {match_id}: no hit frames in set CSVs")
        return False

    y_bounds = _court_y_bounds(homography_df, match_id)

    print(
        f"\n[{match_id}] "
        f"hits={len(hit_frames)}  "
        f"services={len(service_frames)}  "
        f"y_bounds={y_bounds}"
    )

    if use_v3:
        probe = VideoReader(str(video_path), ctx=cpu(0), width=512, height=288)
        total = len(probe)
        del probe

        spans = _rally_spans(hit_frames, total, pad=rally_pad)
        features, valid = _extract_features_v3(
            video_path, tracknet, batch_size, spans, total,
        )
        frame_stride = 1   # V3 path always tracks every frame within spans
    else:
        features = _extract_features(video_path, tracknet, y_bounds, batch_size, frame_stride)
        valid = np.ones(len(features), dtype=bool)
    total = len(features)

    # Map original frame numbers to strided indices; keep radius ~6 original frames
    strided_hits     = [hf // frame_stride for hf in hit_frames]
    strided_services = {sf // frame_stride for sf in service_frames}
    label_radius     = max(1, round(6 / frame_stride / 2))   # ≈ ±6 original frames

    labels = build_labels(
        total_frames=total,
        hit_frames=strided_hits,
        radius=label_radius,
        exclude_frames=strided_services,
    )

    pos = int(labels.sum())
    print(f"   Labels: {pos:,} pos / {total - pos:,} neg  (radius={label_radius} strided frames)")

    np.savez_compressed(
        out_path,
        features=features,
        labels=labels,
        valid=valid,
        hit_frames=np.array(hit_frames, dtype=np.int32),
        frame_stride=np.int32(frame_stride),
    )
    print(f"   Saved -> {out_path}")
    return True


# ---------------------------------------------------------------------------
# Background download worker (prefetches one match ahead)
# ---------------------------------------------------------------------------

def _download_worker(
    rows:         list[dict],
    tmp_dir:      pathlib.Path,
    already_done: set[str],
    result_q:     queue.Queue,
    video_dir:    pathlib.Path | None = None,
) -> None:
    """
    Downloads videos sequentially in a background thread.
    Puts (match_id, video_path_or_None) into result_q.
    A sentinel None signals that all downloads are complete.

    If video_dir is set and a <match_id>.mp4 exists there, the download
    is skipped entirely — the local file path is used directly.

    Queue(maxsize=1) in the caller ensures at most one pre-downloaded video
    sits on disk while the GPU processes the current one.
    """
    for row in rows:
        match_id = row["_match_id"]
        url      = row["_url"]

        if match_id in already_done:
            continue   # skip — npz already exists, don't download

        # Use pre-downloaded video if available
        if video_dir is not None:
            local = video_dir / f"{match_id}.mp4"
            if local.exists():
                mb = local.stat().st_size // (1024 * 1024)
                print(f"[local] {match_id}: using pre-downloaded file ({mb} MB)")
                result_q.put((match_id, local))
                continue

        # Any failure here (bad URL, yt-dlp missing, disk error) must report
        # the match as failed and move on — a dead thread never sends the
        # sentinel and deadlocks the consumer loop.
        try:
            out_path = tmp_dir / f"{match_id}.mp4"
            print(f"[download] {match_id} <- {str(url)[:70]}...")
            t0 = time.time()
            ok = _download_video(url, out_path)
            dt = time.time() - t0
        except Exception as exc:
            print(f"[download] {match_id}: {exc}")
            ok = False

        if ok:
            mb = out_path.stat().st_size // (1024 * 1024)
            print(f"[download] {match_id}: {mb} MB in {dt:.0f}s")
            result_q.put((match_id, out_path))
        else:
            print(f"[download] {match_id}: FAILED")
            result_q.put((match_id, None))

    result_q.put(None)   # sentinel


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = _parse_args()

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    tmp_dir = (
        pathlib.Path(args.tmp_dir)
        if args.tmp_dir
        else pathlib.Path(tempfile.gettempdir()) / "shuttleset_dl"
    )
    tmp_dir.mkdir(parents=True, exist_ok=True)

    use_v3 = bool(args.tracknet_v3_weights)
    if use_v3:
        from detectors.tracknet_v3 import TrackNetV3Adapter
        print(f"[init] Loading TrackNetV3: {args.tracknet_v3_weights}")
        tracknet = TrackNetV3Adapter(args.tracknet_v3_weights, args.inpaintnet_weights)
    elif args.tracknet_weights:
        print(f"[init] Loading legacy TrackNet: {args.tracknet_weights}")
        tracknet = TrackNetAdapter(args.tracknet_weights)
    else:
        raise SystemExit("Provide --tracknet-v3-weights (preferred) or --tracknet-weights")

    print(f"[init] Loading homography: {args.homography_csv}")
    homography_df = _load_homography(pathlib.Path(args.homography_csv))

    df = _load_match_csv(args.match_csv)
    if args.match:
        df = df[df["_match_id"] == args.match]
        if df.empty:
            raise SystemExit(f"Match ID '{args.match}' not found in {args.match_csv}")

    rows = df.to_dict("records")
    print(f"[init] {len(rows)} match(es) to process")

    already_done = {
        p.stem.removeprefix("features_")
        for p in out_dir.glob("features_*.npz")
    }
    if already_done:
        print(f"[init] {len(already_done)} already extracted — will skip")

    shuttle_root = pathlib.Path(args.shuttleset_dir)

    video_dir = pathlib.Path(args.video_dir) if args.video_dir else None

    # Queue maxsize=1 — producer downloads at most one video ahead of consumer
    result_q  = queue.Queue(maxsize=1)
    dl_thread = threading.Thread(
        target=_download_worker,
        args=(rows, tmp_dir, already_done, result_q, video_dir),
        daemon=True,
    )
    dl_thread.start()

    ok_count = fail_count = 0

    while True:
        item = result_q.get()
        if item is None:
            break   # all downloads submitted

        match_id, video_path = item

        if video_path is None:
            print(f"[error] {match_id}: skipping (download failed)")
            fail_count += 1
            continue

        match_dir = shuttle_root / match_id
        try:
            success = _process_match(
                match_id, match_dir, video_path,
                tracknet, out_dir, args.batch_size,
                homography_df, args.frame_stride,
                use_v3=use_v3, rally_pad=args.rally_pad,
            )
            ok_count    += int(success)
            fail_count  += int(not success)
        except Exception as exc:
            print(f"[error] {match_id}: {exc}")
            fail_count += 1
        finally:
            # Only delete videos that were downloaded to tmp_dir, not pre-existing local files
            if video_path.exists() and video_path.parent == tmp_dir:
                video_path.unlink()
                print(f"[cleanup] {match_id}.mp4 deleted")

    dl_thread.join()
    print(
        f"\n[done] {ok_count} extracted  {fail_count} failed"
        f"  ->  {out_dir}"
    )


if __name__ == "__main__":
    main()
