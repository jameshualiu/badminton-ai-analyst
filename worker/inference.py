import numpy as np
from detectors.court_detector import CourtDetectorAdapter, NetDetectorAdapter, YoloPoseAdapter, TrackNetAdapter, ShotClassifierAdapter


class BadmintonInference:
    def __init__(self, tracknet_path, court_kprcnn_path, net_kprcnn_path, yolo_pose_path, lstm_path=None,
                 tracknet_v3_path=None, inpaintnet_path=None, hit_detector_path=None, bst_path=None):
        # Prefer TrackNetV3 (median-background windows + InpaintNet rectification);
        # fall back to the legacy single-frame TrackNet if V3 weights are absent.
        self.tracknet_v3 = None
        if tracknet_v3_path:
            try:
                from detectors.tracknet_v3 import TrackNetV3Adapter
                self.tracknet_v3 = TrackNetV3Adapter(tracknet_v3_path, inpaintnet_path)
            except Exception as e:
                print(f"[tracknetv3] WARNING: failed to load V3 weights ({e}); using legacy TrackNet")

        self.tracknet   = TrackNetAdapter(tracknet_path) if self.tracknet_v3 is None else None
        self.court_det  = CourtDetectorAdapter(court_kprcnn_path)
        self.net_det    = NetDetectorAdapter(net_kprcnn_path)
        self.pose_det   = YoloPoseAdapter(yolo_pose_path)
        self.shot_clf = None
        if lstm_path:
            try:
                self.shot_clf = ShotClassifierAdapter(lstm_path)
            except Exception as e:
                print(f"[lstm] WARNING: failed to load ({e}); using rule-based shot classification")

        # Learned hit detection (CNN over trajectory windows); heuristic fallback
        self.hit_det = None
        if hit_detector_path:
            try:
                from detectors.hit_detector import HitDetectorAdapter
                self.hit_det = HitDetectorAdapter(hit_detector_path)
            except Exception as e:
                print(f"[hitnet] WARNING: failed to load ({e}); using heuristic hit detection")

        # BST stroke-type classifier (25 classes); LSTM fallback
        self.bst_clf = None
        if bst_path:
            try:
                from detectors.stroke_classifier import BSTStrokeClassifierAdapter
                self.bst_clf = BSTStrokeClassifierAdapter(bst_path)
            except Exception as e:
                print(f"[bst] WARNING: failed to load ({e}); using LSTM shot classifier")

        shuttle_model = "TrackNetV3" if self.tracknet_v3 else "TrackNet"
        hit_model = "HitNet" if self.hit_det else "heuristic"
        clf_model = "BST" if self.bst_clf else ("LSTM" if self.shot_clf else "rule-based")
        print(f"[start] All Models Loaded Successfully ({shuttle_model} + RCNN + YOLO Pose + "
              f"{hit_model} hits + {clf_model} strokes)")

    def detect_hits(self, shuttle_traj: list):
        """Learned hit detection, or None if unavailable (caller falls back)."""
        if self.hit_det is None:
            return None
        return self.hit_det.detect(shuttle_traj)

    def track_shuttle(self, vr, total_frames: int, batch_size: int = 4):
        """
        Full-video shuttle tracking with TrackNetV3, or None if V3 is unavailable
        (caller should fall back to predict_ball_batch).
        Returns:
            [{"frame", "pos": [x,y]|None, "confidence", "inpainted"}, ...]
        """
        if self.tracknet_v3 is None:
            return None
        return self.tracknet_v3.track_video(vr, total_frames, batch_size)

    def predict_ball_batch(self, batch_tensor: np.ndarray) -> np.ndarray:
        """
        Args:
            batch_tensor: (N, 9, 288, 512) float32 in [0, 1]
        Returns:
            (N, 1, 288, 512) float32 heatmap for the centre frame
        """
        if self.tracknet is None:
            raise RuntimeError("Legacy TrackNet not loaded (TrackNetV3 is active); use track_shuttle()")
        return self.tracknet.predict_batch(batch_tensor)

    def predict_pose_batch(self, frames: list) -> list:
        """
        Args:
            frames: list of HxWx3 uint8 numpy arrays
        Returns:
            list of per-frame player lists:
            [[{"id", "skeleton": [[x,y]*17], "box": [x1,y1,x2,y2]}, ...], ...]
        """
        return self.pose_det.detect_batch(frames)

    def detect_geometry(self, first_frame) -> dict:
        """
        Detect court keypoints (RCNN) and net keypoints (RCNN).
        Returns:
            {
                "court": [[x,y]*4] | None,             # 4-corner quad for homography
                "net": [[x,y]*4] | None,               # corrected net rectangle
                "court_keypoints_6": list | None,      # [TL, TR, ML, MR, BL, BR]
                "court_keypoints_35": list | None,     # 7x5 expanded grid
            }
        """
        court_result = self.court_det.detect(first_frame)
        kp6  = court_result["keypoints_6"]  if court_result["success"] else None
        kp35 = court_result["keypoints_35"] if court_result["success"] else None
        court_poly = [kp6[0], kp6[1], kp6[5], kp6[4]] if kp6 else None

        net_result = self.net_det.detect(first_frame)
        net_kp4 = net_result["keypoints_4"] if net_result["success"] else None

        return {
            "court": court_poly,
            "net": net_kp4,
            "court_keypoints_6": kp6,
            "court_keypoints_35": kp35,
        }

    def classify_shot(self, skeleton_sequence: list) -> str:
        if self.shot_clf is None:
            return "Unknown"
        return self.shot_clf.classify(skeleton_sequence)
