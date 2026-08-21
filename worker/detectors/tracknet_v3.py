"""TrackNetV3 shuttle tracking: trajectory prediction + InpaintNet rectification.

Model architectures and inference recipe vendored from the official
implementation (MIT License):
    https://github.com/qaz812345/TrackNetV3
    "TrackNetV3: Enhancing ShuttleCock Tracking with Augmentations and
    Trajectory Rectification" (ACM MM Asia 2023)

Checkpoints: TrackNet_best.pt (seq_len=8, bg_mode='concat') and
InpaintNet_best.pt (seq_len=16), trained on the Shuttlecock Trajectory
Dataset.
"""

import math
from typing import Optional

import cv2
import numpy as np
import torch
import torch.nn as nn

HEIGHT = 288
WIDTH = 512
# Inpainted coords with both x and y below this (normalized) are "not visible"
COOR_TH = 50 / math.sqrt(HEIGHT ** 2 + WIDTH ** 2)


# ---------------------------------------------------------------------------
# Model definitions (verbatim from TrackNetV3 model.py)
# ---------------------------------------------------------------------------

class Conv2DBlock(nn.Module):
    """ Conv2D + BN + ReLU """
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.conv = nn.Conv2d(in_dim, out_dim, kernel_size=3, padding='same', bias=False)
        self.bn = nn.BatchNorm2d(out_dim)
        self.relu = nn.ReLU()

    def forward(self, x):
        return self.relu(self.bn(self.conv(x)))


class Double2DConv(nn.Module):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.conv_1 = Conv2DBlock(in_dim, out_dim)
        self.conv_2 = Conv2DBlock(out_dim, out_dim)

    def forward(self, x):
        return self.conv_2(self.conv_1(x))


class Triple2DConv(nn.Module):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.conv_1 = Conv2DBlock(in_dim, out_dim)
        self.conv_2 = Conv2DBlock(out_dim, out_dim)
        self.conv_3 = Conv2DBlock(out_dim, out_dim)

    def forward(self, x):
        return self.conv_3(self.conv_2(self.conv_1(x)))


class TrackNetV3(nn.Module):
    """U-Net style heatmap predictor. For bg_mode='concat':
    in_dim=(seq_len+1)*3, out_dim=seq_len."""

    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.down_block_1 = Double2DConv(in_dim, 64)
        self.down_block_2 = Double2DConv(64, 128)
        self.down_block_3 = Triple2DConv(128, 256)
        self.bottleneck = Triple2DConv(256, 512)
        self.up_block_1 = Triple2DConv(768, 256)
        self.up_block_2 = Double2DConv(384, 128)
        self.up_block_3 = Double2DConv(192, 64)
        self.predictor = nn.Conv2d(64, out_dim, (1, 1))
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        x1 = self.down_block_1(x)
        x = nn.MaxPool2d((2, 2), stride=(2, 2))(x1)
        x2 = self.down_block_2(x)
        x = nn.MaxPool2d((2, 2), stride=(2, 2))(x2)
        x3 = self.down_block_3(x)
        x = nn.MaxPool2d((2, 2), stride=(2, 2))(x3)
        x = self.bottleneck(x)
        x = torch.cat([nn.Upsample(scale_factor=2)(x), x3], dim=1)
        x = self.up_block_1(x)
        x = torch.cat([nn.Upsample(scale_factor=2)(x), x2], dim=1)
        x = self.up_block_2(x)
        x = torch.cat([nn.Upsample(scale_factor=2)(x), x1], dim=1)
        x = self.up_block_3(x)
        x = self.predictor(x)
        return self.sigmoid(x)


class Conv1DBlock(nn.Module):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.conv = nn.Conv1d(in_dim, out_dim, kernel_size=3, padding='same', bias=True)
        self.relu = nn.LeakyReLU()

    def forward(self, x):
        return self.relu(self.conv(x))


class Double1DConv(nn.Module):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.conv_1 = Conv1DBlock(in_dim, out_dim)
        self.conv_2 = Conv1DBlock(out_dim, out_dim)

    def forward(self, x):
        return self.conv_2(self.conv_1(x))


class InpaintNet(nn.Module):
    """1D U-Net over (x, y, mask) coordinate sequences."""

    def __init__(self):
        super().__init__()
        self.down_1 = Conv1DBlock(3, 32)
        self.down_2 = Conv1DBlock(32, 64)
        self.down_3 = Conv1DBlock(64, 128)
        self.buttleneck = Double1DConv(128, 256)
        self.up_1 = Conv1DBlock(384, 128)
        self.up_2 = Conv1DBlock(192, 64)
        self.up_3 = Conv1DBlock(96, 32)
        self.predictor = nn.Conv1d(32, 2, 3, padding='same')
        self.sigmoid = nn.Sigmoid()

    def forward(self, x, m):
        x = torch.cat([x, m], dim=2)      # (N, L, 3)
        x = x.permute(0, 2, 1)            # (N, 3, L)
        x1 = self.down_1(x)
        x2 = self.down_2(x1)
        x3 = self.down_3(x2)
        x = self.buttleneck(x3)
        x = torch.cat([x, x3], dim=1)
        x = self.up_1(x)
        x = torch.cat([x, x2], dim=1)
        x = self.up_2(x)
        x = torch.cat([x, x1], dim=1)
        x = self.up_3(x)
        x = self.predictor(x)             # (N, 2, L)
        x = self.sigmoid(x)
        return x.permute(0, 2, 1)         # (N, L, 2)


# ---------------------------------------------------------------------------
# Inference helpers (ported from TrackNetV3 test.py / predict.py)
# ---------------------------------------------------------------------------

def predict_location(heatmap: np.ndarray):
    """Center of the largest contour in a binary uint8 heatmap, or None."""
    if np.amax(heatmap) == 0:
        return None
    cnts, _ = cv2.findContours(heatmap, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    rects = [cv2.boundingRect(ctr) for ctr in cnts]
    x, y, w, h = max(rects, key=lambda r: r[2] * r[3])
    return int(x + w / 2), int(y + h / 2)


def generate_inpaint_mask(y_coords: np.ndarray, visibility: np.ndarray, th_h: float):
    """Mark invisible gaps as repairable (1) unless the shuttle plausibly left
    the camera view at the top of the frame (y < th_h on the gap boundary)."""
    inpaint_mask = np.zeros_like(visibility)
    i = 0  # index where ball starts to disappear
    j = 0  # index where ball reappears
    n = len(visibility)
    while j < n:
        while i < n - 1 and visibility[i] == 1:
            i += 1
        j = i
        while j < n - 1 and visibility[j] == 0:
            j += 1
        if j == i:
            break
        elif i == 0 and y_coords[j] > th_h:
            inpaint_mask[:j] = 1
        elif (i > 1 and y_coords[i - 1] > th_h) and (j < n and y_coords[j] > th_h):
            inpaint_mask[i:j] = 1
        i = j
    return inpaint_mask


class TrackNetV3Adapter:
    """Shuttle tracking with TrackNetV3 checkpoints.

    Produces the same trajectory format the pipeline already consumes:
    [{"frame": int, "pos": [x, y] | None, "confidence": float,
      "inpainted": bool}, ...] with coords in 512x288 space.
    """

    def __init__(self, tracknet_path: str, inpaintnet_path: Optional[str] = None,
                 device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        ckpt = torch.load(tracknet_path, map_location=self.device, weights_only=True)
        params = ckpt["param_dict"]
        self.seq_len = params["seq_len"]
        bg_mode = params["bg_mode"]
        if bg_mode != "concat":
            raise ValueError(f"Unsupported TrackNetV3 bg_mode: {bg_mode!r} (expected 'concat')")
        self._tracknet = TrackNetV3(in_dim=(self.seq_len + 1) * 3, out_dim=self.seq_len)
        self._tracknet.load_state_dict(ckpt["model"])
        self._tracknet.to(self.device).eval()

        self._inpaintnet = None
        if inpaintnet_path:
            ckpt_in = torch.load(inpaintnet_path, map_location=self.device, weights_only=True)
            self.inpaint_seq_len = ckpt_in["param_dict"]["seq_len"]
            self._inpaintnet = InpaintNet()
            self._inpaintnet.load_state_dict(ckpt_in["model"])
            self._inpaintnet.to(self.device).eval()

        print(f"[tracknetv3] Loaded (seq_len={self.seq_len}, "
              f"inpaint={'yes' if self._inpaintnet else 'no'}, device={self.device})")

    # -- background estimation ------------------------------------------------

    def _compute_median(self, vr, total_frames: int, max_samples: int = 150) -> np.ndarray:
        """Median image over evenly sampled frames -> (3, H, W) float32 uint8-range."""
        n = min(total_frames, max_samples)
        indices = np.linspace(0, total_frames - 1, n).astype(int).tolist()
        frames = vr.get_batch(indices).asnumpy()  # (n, H, W, 3) RGB uint8
        median = np.median(frames, axis=0).astype("float32")  # (H, W, 3)
        return np.moveaxis(median, -1, 0)  # (3, H, W)

    # -- main entry point -----------------------------------------------------

    def track_video(self, vr, total_frames: int, batch_size: int = 4) -> list:
        """Track the shuttle across a 512x288 decord VideoReader.

        Non-overlap window inference (sliding_step = seq_len), then optional
        InpaintNet trajectory rectification.
        """
        L = self.seq_len
        median = self._compute_median(vr, total_frames)

        xs = np.zeros(total_frames, dtype=np.float32)
        ys = np.zeros(total_frames, dtype=np.float32)
        confs = np.zeros(total_frames, dtype=np.float32)

        window_starts = list(range(0, total_frames, L))
        for chunk_start in range(0, len(window_starts), batch_size):
            chunk = window_starts[chunk_start:chunk_start + batch_size]
            batch = np.empty((len(chunk), (L + 1) * 3, HEIGHT, WIDTH), dtype=np.float32)
            for bi, ws in enumerate(chunk):
                # Clamp indices so the tail window repeats the last frame
                indices = [min(ws + k, total_frames - 1) for k in range(L)]
                frames = vr.get_batch(indices).asnumpy().astype("float32")  # (L, H, W, 3)
                frames = frames.transpose(0, 3, 1, 2).reshape(L * 3, HEIGHT, WIDTH)
                batch[bi] = np.concatenate([median, frames], axis=0) / 255.0

            tensor = torch.from_numpy(batch).to(self.device)
            with torch.no_grad():
                heatmaps = self._tracknet(tensor).cpu().numpy()  # (B, L, H, W)

            for bi, ws in enumerate(chunk):
                for k in range(L):
                    f = ws + k
                    if f >= total_frames:
                        break
                    hm = heatmaps[bi, k]
                    confs[f] = float(hm.max())
                    loc = predict_location((hm > 0.5).astype("uint8"))
                    if loc is not None:
                        xs[f], ys[f] = loc

        visibility = ((xs > 0) | (ys > 0)).astype(np.float32)
        inpainted = np.zeros(total_frames, dtype=bool)

        if self._inpaintnet is not None and total_frames >= 2:
            xs, ys, visibility, inpainted = self._rectify(xs, ys, visibility)

        trajectory = []
        for f in range(total_frames):
            pos = [int(xs[f]), int(ys[f])] if visibility[f] else None
            trajectory.append({
                "frame": f,
                "pos": pos,
                "confidence": float(confs[f]),
                "inpainted": bool(inpainted[f]),
            })
        return trajectory

    # -- rectification ---------------------------------------------------------

    def _rectify(self, xs, ys, visibility):
        """Repair trajectory gaps with InpaintNet (non-overlap windows)."""
        L = self.inpaint_seq_len
        n = len(xs)
        mask = generate_inpaint_mask(ys, visibility, th_h=HEIGHT * 0.05).astype(np.float32)

        coords = np.stack([xs / WIDTH, ys / HEIGHT], axis=1).astype(np.float32)  # (n, 2)

        # Pad to a multiple of L by repeating the last coordinate
        n_pad = (L - n % L) % L
        coords_p = np.concatenate([coords, np.repeat(coords[-1:], n_pad, axis=0)])
        mask_p = np.concatenate([mask, np.zeros(n_pad, dtype=np.float32)])

        coor_t = torch.from_numpy(coords_p.reshape(-1, L, 2)).to(self.device)
        mask_t = torch.from_numpy(mask_p.reshape(-1, L, 1)).to(self.device)

        with torch.no_grad():
            inpainted_t = self._inpaintnet(coor_t, mask_t).cpu()
        # Keep original coords where mask=0, inpainted where mask=1
        result = (inpainted_t * mask_t.cpu() + coor_t.cpu() * (1 - mask_t.cpu())).numpy()
        result = result.reshape(-1, 2)[:n]

        # Near-zero coords mean "still not visible"
        invisible = (result[:, 0] < COOR_TH) & (result[:, 1] < COOR_TH)
        result[invisible] = 0.0

        new_xs = result[:, 0] * WIDTH
        new_ys = result[:, 1] * HEIGHT
        new_vis = (~invisible).astype(np.float32)
        inpainted = (mask > 0.5) & ~invisible

        repaired = int(((mask > 0.5) & (visibility == 0) & (new_vis == 1)).sum())
        print(f"[tracknetv3] InpaintNet repaired {repaired} frames "
              f"({int((visibility == 0).sum())} were missing)")
        return new_xs, new_ys, new_vis, inpainted
