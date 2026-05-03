import torch
import torch.nn as nn
import torchvision
import torchvision.transforms.functional as F
import numpy as np
from typing import Optional


def _load_model(weights_path: str, device: str):
    """Load a full-model .pth/.pt file (not a state dict)."""
    return torch.load(weights_path, map_location=device, weights_only=False)


# ---------------------------------------------------------------------------
# TrackNet architecture — required to load ball_track.pt (saved as state dict)
# ---------------------------------------------------------------------------

class _Conv(nn.Module):
    def __init__(self, ic, oc, k=(3, 3), p="same", act=True):
        super().__init__()
        self.conv = nn.Conv2d(ic, oc, kernel_size=k, padding=p)
        self.bn   = nn.BatchNorm2d(oc)
        self.act  = nn.ReLU() if act else nn.Identity()

    def forward(self, x):
        return self.bn(self.act(self.conv(x)))


class _TrackNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv2d_1  = _Conv(9, 64)
        self.conv2d_2  = _Conv(64, 64)
        self.max_pooling_1 = nn.MaxPool2d((2, 2), stride=(2, 2))
        self.conv2d_3  = _Conv(64, 128)
        self.conv2d_4  = _Conv(128, 128)
        self.max_pooling_2 = nn.MaxPool2d((2, 2), stride=(2, 2))
        self.conv2d_5  = _Conv(128, 256)
        self.conv2d_6  = _Conv(256, 256)
        self.conv2d_7  = _Conv(256, 256)
        self.max_pooling_3 = nn.MaxPool2d((2, 2), stride=(2, 2))
        self.conv2d_8  = _Conv(256, 512)
        self.conv2d_9  = _Conv(512, 512)
        self.conv2d_10 = _Conv(512, 512)
        self.up_sampling_1 = nn.UpsamplingNearest2d(scale_factor=2)
        self.conv2d_11 = _Conv(768, 256)
        self.conv2d_12 = _Conv(256, 256)
        self.conv2d_13 = _Conv(256, 256)
        self.up_sampling_2 = nn.UpsamplingNearest2d(scale_factor=2)
        self.conv2d_14 = _Conv(384, 128)
        self.conv2d_15 = _Conv(128, 128)
        self.up_sampling_3 = nn.UpsamplingNearest2d(scale_factor=2)
        self.conv2d_16 = _Conv(192, 64)
        self.conv2d_17 = _Conv(64, 64)
        self.conv2d_18 = nn.Conv2d(64, 3, kernel_size=(1, 1), padding="same")

    def forward(self, x):
        x  = self.conv2d_1(x)
        x1 = self.conv2d_2(x)
        x  = self.max_pooling_1(x1)
        x  = self.conv2d_3(x)
        x2 = self.conv2d_4(x)
        x  = self.max_pooling_2(x2)
        x  = self.conv2d_5(x)
        x  = self.conv2d_6(x)
        x3 = self.conv2d_7(x)
        x  = self.max_pooling_3(x3)
        x  = self.conv2d_8(x)
        x  = self.conv2d_9(x)
        x  = self.conv2d_10(x)
        x  = self.up_sampling_1(x)
        x  = torch.concat([x, x3], dim=1)
        x  = self.conv2d_11(x)
        x  = self.conv2d_12(x)
        x  = self.conv2d_13(x)
        x  = self.up_sampling_2(x)
        x  = torch.concat([x, x2], dim=1)
        x  = self.conv2d_14(x)
        x  = self.conv2d_15(x)
        x  = self.up_sampling_3(x)
        x  = torch.concat([x, x1], dim=1)
        x  = self.conv2d_16(x)
        x  = self.conv2d_17(x)
        x  = self.conv2d_18(x)
        return torch.sigmoid(x)


def _rcnn_top_detection(output, score_threshold=0.7, nms_iou=0.3):
    """
    Run NMS on RCNN output and return the top detection's keypoints, or None.
    Returns np.ndarray of shape (K, 3) [x, y, visibility], or None.
    """
    scores = output[0]['scores'].detach().cpu().numpy()
    high_score_idxs = np.where(scores > score_threshold)[0].tolist()
    if not high_score_idxs:
        return None

    post_nms_idxs = torchvision.ops.nms(
        output[0]['boxes'][high_score_idxs],
        output[0]['scores'][high_score_idxs],
        nms_iou,
    ).cpu().numpy()

    kps_tensor = output[0]['keypoints'][high_score_idxs][post_nms_idxs]
    if len(kps_tensor) == 0:
        return None

    return kps_tensor[0].detach().cpu().numpy()  # (K, 3)


class CourtDetectorAdapter:
    """Detects 6 court corner keypoints using court_kpRCNN.pth.
    Keypoint order: [TL, TR, ML, MR, BL, BR]
    Expands to 35-point grid (7 rows x 5 cols) for court line rendering.
    """

    def __init__(self, weights_path: str, device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._model = _load_model(weights_path, self.device)
        self._model.to(self.device).eval()

    def detect(self, frame: np.ndarray) -> dict:
        """
        Args:
            frame: HxWx3 uint8 numpy array
        Returns:
            {"success": bool, "keypoints_6": list|None, "keypoints_35": list|None}
        """
        image = F.to_tensor(frame.copy()).unsqueeze(0).to(self.device)
        with torch.no_grad():
            output = self._model(image)

        raw_kps = _rcnn_top_detection(output)
        if raw_kps is None:
            return {"success": False, "keypoints_6": None, "keypoints_35": None}

        true_points = [list(map(int, kp[:2])) for kp in raw_kps]
        corrected = self._correction(true_points)
        expanded = self._partition(corrected)

        return {
            "success": True,
            "keypoints_6": corrected.tolist(),
            "keypoints_35": expanded.tolist(),
        }

    def _correction(self, true_points: list) -> np.ndarray:
        """Average Y per row so court lines are horizontal."""
        kp = np.array(true_points)
        ty = int(np.round((kp[0][1] + kp[1][1]) / 2))
        my = int((kp[2][1] + kp[3][1]) / 2)
        by = int(np.round((kp[4][1] + kp[5][1]) / 2))
        kp[0][1] = kp[1][1] = ty
        kp[2][1] = kp[3][1] = my
        kp[4][1] = kp[5][1] = by
        return kp

    def _partition(self, court_kp: np.ndarray) -> np.ndarray:
        """Expand 6 corrected keypoints to 35-point court grid (7 rows x 5 cols)."""
        kp = np.array(court_kp)
        tlspace = np.array([np.round((kp[0][0] - kp[2][0]) / 3), np.round((kp[2][1] - kp[0][1]) / 3)], dtype=int)
        trspace = np.array([np.round((kp[3][0] - kp[1][0]) / 3), np.round((kp[3][1] - kp[1][1]) / 3)], dtype=int)
        blspace = np.array([np.round((kp[2][0] - kp[4][0]) / 3), np.round((kp[4][1] - kp[2][1]) / 3)], dtype=int)
        brspace = np.array([np.round((kp[5][0] - kp[3][0]) / 3), np.round((kp[5][1] - kp[3][1]) / 3)], dtype=int)

        p2  = np.array([kp[0][0] - tlspace[0], kp[0][1] + tlspace[1]])
        p3  = np.array([kp[1][0] + trspace[0], kp[1][1] + trspace[1]])
        p4  = np.array([p2[0]   - tlspace[0],  p2[1]   + tlspace[1]])
        p5  = np.array([p3[0]   + trspace[0],  p3[1]   + trspace[1]])
        p8  = np.array([kp[2][0] - blspace[0], kp[2][1] + blspace[1]])
        p9  = np.array([kp[3][0] + brspace[0], kp[3][1] + brspace[1]])
        p10 = np.array([p8[0]   - blspace[0],  p8[1]   + blspace[1]])
        p11 = np.array([p9[0]   + brspace[0],  p9[1]   + brspace[1]])

        pairs = np.array([
            kp[0], kp[1], p2, p3, p4, p5, kp[2], kp[3],
            p8, p9, p10, p11, kp[4], kp[5]
        ], dtype=int)

        ukp = []
        for i in range(0, 13, 2):
            sub2 = np.round((pairs[i] + pairs[i + 1]) / 2).astype(int)
            sub1 = np.round((pairs[i] + sub2) / 2).astype(int)
            sub3 = np.round((pairs[i + 1] + sub2) / 2).astype(int)
            ukp += [pairs[i], sub1, sub2, sub3, pairs[i + 1]]
        return np.array(ukp, dtype=int)


class NetDetectorAdapter:
    """Detects 4 net keypoints using net_kpRCNN.pth.
    Raw keypoint order: [TL-pole, BL-pole, BR-pole, TR-pole]
    After correction: rectangular net with aligned x/y edges.
    """

    def __init__(self, weights_path: str, device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._model = _load_model(weights_path, self.device)
        self._model.to(self.device).eval()

    def detect(self, frame: np.ndarray) -> dict:
        """
        Returns:
            {"success": bool, "keypoints_4": [[x,y]*4] | None}
            Keypoint order after correction: [TL, BL, BR, TR]
        """
        image = F.to_tensor(frame.copy()).unsqueeze(0).to(self.device)
        with torch.no_grad():
            output = self._model(image)

        raw_kps = _rcnn_top_detection(output)
        if raw_kps is None:
            return {"success": False, "keypoints_4": None}

        true_points = [list(map(int, kp[:2])) for kp in raw_kps]
        corrected = self._correction(true_points)

        return {"success": True, "keypoints_4": corrected.tolist()}

    def _correction(self, true_points: list) -> np.ndarray:
        """Align net keypoints to form a clean rectangle."""
        kp = np.array(true_points)
        # kp[0]=TL, kp[1]=BL, kp[2]=BR, kp[3]=TR
        up_y   = int(np.round((kp[0][1] + kp[3][1]) / 2))
        down_y = int(np.round((kp[1][1] + kp[2][1]) / 2))
        left_x = int(np.round((kp[0][0] + kp[1][0]) / 2))
        right_x = int(np.round((kp[3][0] + kp[2][0]) / 2))
        kp[0] = [left_x,  up_y]
        kp[1] = [left_x,  down_y]
        kp[2] = [right_x, down_y]
        kp[3] = [right_x, up_y]
        return kp


class YoloPoseAdapter:
    """Detects player skeletons using YOLO11x-pose.
    Same model family used to generate the LSTM training data, so keypoint
    distributions match the classifier's expected input.
    Returns 17 COCO keypoints per detected person (score-filtered).
    """
    SCORE_THRESHOLD = 0.5

    def __init__(self, weights_path: str):
        from ultralytics import YOLO
        self._model = YOLO(weights_path)
        print(f"🤸 YoloPoseAdapter loaded: {weights_path}")

    def detect_batch(self, frames: list) -> list:
        """
        Args:
            frames: list of HxWx3 uint8 numpy arrays
        Returns:
            list (one entry per frame) of player lists:
            [[{"id": int, "skeleton": [[x,y]*17], "box": [x1,y1,x2,y2]}, ...], ...]
        """
        results = self._model(frames, verbose=False)

        output = []
        for result in results:
            players = []
            if result.keypoints is not None and result.boxes is not None:
                kpts  = result.keypoints.xy.cpu().numpy()   # (N, 17, 2)
                boxes = result.boxes.xyxy.cpu().numpy()     # (N, 4)
                confs = result.boxes.conf.cpu().numpy()     # (N,)
                for i in range(len(confs)):
                    if confs[i] < self.SCORE_THRESHOLD:
                        continue
                    players.append({
                        "id": len(players),
                        "skeleton": kpts[i].tolist(),
                        "box": boxes[i].tolist(),
                    })
            output.append(players)
        return output


class TrackNetAdapter:
    """Runs shuttle tracking using ball_track.pt (PyTorch TrackNet).
    Input:  (N, 9, 288, 512) float32 numpy array (3 stacked RGB frames)
    Output: (N, 1, 288, 512) float32 numpy array (heatmap for centre frame)
    """

    def __init__(self, weights_path: str, device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        # ball_track.pt is saved as a state dict, so we instantiate the
        # architecture and load weights manually.
        self._model = _TrackNet()
        state = torch.load(weights_path, map_location=self.device, weights_only=False)
        self._model.load_state_dict(state)
        self._model.to(self.device).eval()

    def predict_batch(self, batch: np.ndarray) -> np.ndarray:
        """
        Args:
            batch: (N, 9, 288, 512) float32 numpy array, values in [0, 1]
        Returns:
            (N, 1, 288, 512) float32 numpy array — heatmap for the centre frame
        """
        tensor = torch.from_numpy(batch).to(self.device)
        with torch.no_grad():
            output = self._model(tensor)  # (N, 3, 288, 512) with sigmoid applied
        # Channel 1 = heatmap for the centre (current) frame of the triplet
        return output[:, 1:2, :, :].cpu().numpy()


class ShotClassifierAdapter:
    # COCO 17 indices to keep: nose + shoulders/elbows/wrists + hips/knees/ankles (drops eyes/ears)
    COCO_SUBSET = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    CLASSES = ["Clear", "Drive", "Drop", "Lob", "Net", "Smash"]
    FRAME_W = 512.0
    FRAME_H = 288.0

    def __init__(self, weights_path: str):
        import onnxruntime as ort
        self._session = ort.InferenceSession(
            weights_path,
            providers=["CPUExecutionProvider"],
        )
        self._input_name = self._session.get_inputs()[0].name
        print(f"🎯 ShotClassifierAdapter loaded: {weights_path}")

    def classify(self, skeleton_sequence: list) -> str:
        """
        Args:
            skeleton_sequence: list of T entries, each [[x,y]*13] or None for missing frames
        Returns:
            One of CLASSES
        """
        T = len(skeleton_sequence)
        arr = np.zeros((1, T, 26), dtype=np.float32)
        for t, kps in enumerate(skeleton_sequence):
            if kps:
                for k, (x, y) in enumerate(kps):
                    arr[0, t, k * 2]     = x / self.FRAME_W
                    arr[0, t, k * 2 + 1] = y / self.FRAME_H
        probs = self._session.run(None, {self._input_name: arr})[0]
        return self.CLASSES[int(np.argmax(probs[0]))]
