import numpy as np
from court_detector import CourtDetectorAdapter, NetDetectorAdapter, YoloPoseAdapter, TrackNetAdapter, ShotClassifierAdapter


class BadmintonInference:
    def __init__(self, tracknet_path, court_kprcnn_path, net_kprcnn_path, yolo_pose_path, lstm_path=None):
        self.tracknet   = TrackNetAdapter(tracknet_path)
        self.court_det  = CourtDetectorAdapter(court_kprcnn_path)
        self.net_det    = NetDetectorAdapter(net_kprcnn_path)
        self.pose_det   = YoloPoseAdapter(yolo_pose_path)
        self.shot_clf   = ShotClassifierAdapter(lstm_path) if lstm_path else None
        print("🚀 All Models Loaded Successfully (TrackNet + RCNN + YOLO Pose)")

    def predict_ball_batch(self, batch_tensor: np.ndarray) -> np.ndarray:
        """
        Args:
            batch_tensor: (N, 9, 288, 512) float32 in [0, 1]
        Returns:
            (N, 1, 288, 512) float32 heatmap for the centre frame
        """
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
