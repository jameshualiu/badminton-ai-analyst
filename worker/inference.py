import onnxruntime as ort
import numpy as np
import cv2
from ultralytics import YOLO

class BadmintonInference:
    def __init__(self, onnx_path, court_model_path, net_model_path):
        # 1. Load TrackNet (ONNX) - Optimized for GPU with FP16 support
        self.providers = [
            ('CUDAExecutionProvider', {
                'device_id': 0,
                'arena_extend_strategy': 'kSameAsRequested',
                'cudnn_conv_algo_search': 'EXHAUSTIVE',
                'do_copy_in_default_stream': True,
            }),
            'CPUExecutionProvider',
        ]
        self.tracknet_session = ort.InferenceSession(onnx_path, providers=self.providers)
        
        # 2. Load YOLOv8 Models and move to GPU/Half precision
        self.pose_model = YOLO("yolov8n-pose.pt")
        self.pose_model.to('cuda')
        
        self.court_model = YOLO(court_model_path)
        self.net_model = YOLO(net_model_path)
        
        print("🚀 Lean Optimized Models Loaded Successfully")

    def predict_ball_batch(self, batch_tensor):
        """
        Runs inference on a batch of 9-channel frame stacks (N, 9, 288, 512).
        """
        ort_inputs = {self.tracknet_session.get_inputs()[0].name: batch_tensor}
        return self.tracknet_session.run(None, ort_inputs)[0]

    def predict_pose_batch(self, frames):
        """
        Runs YOLOv8-pose on a list of raw frames using half-precision (FP16).
        """
        return self.pose_model(frames, stream=True, verbose=False, half=True)

    def detect_geometry(self, first_frame):
        """
        Detects court and net masks on the first frame.
        """
        court_res = self.court_model(first_frame, verbose=False)[0]
        net_res = self.net_model(first_frame, verbose=False)[0]
        
        geometry = {"court": None, "net": None}
        
        if court_res.masks:
            idx = court_res.boxes.conf.argmax()
            geometry["court"] = court_res.masks.xy[idx].tolist()
            
        if net_res.masks:
            idx = net_res.boxes.conf.argmax()
            geometry["net"] = net_res.masks.xy[idx].tolist()
            
        return geometry
