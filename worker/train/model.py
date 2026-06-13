# worker/train/model.py
import torch
import torch.nn as nn


class HitDetectorCNN(nn.Module):
    WINDOW   = 31
    FEATURES = 7   # V3 extraction: [conf, x, y, vx, vy, visible, inpainted]

    def __init__(self, features: int = FEATURES):
        super().__init__()
        self.features = features
        self.conv = nn.Sequential(
            nn.Conv1d(features, 32, kernel_size=5, padding=2),
            nn.ReLU(),
            nn.BatchNorm1d(32),
            nn.Dropout(0.1),
            nn.Conv1d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.BatchNorm1d(64),
            nn.Dropout(0.1),
            nn.Conv1d(64, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.BatchNorm1d(64),
        )
        self.head = nn.Sequential(
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, 31, F)
        x = x.transpose(1, 2)      # (B, F, 31)
        x = self.conv(x)           # (B, 64, 31)
        x = x.mean(dim=2)          # (B, 64) global average pool
        return self.head(x).squeeze(1)  # (B,) logit


class _SigmoidWrapper(nn.Module):
    """Wraps HitDetectorCNN to output probabilities; used only for ONNX export."""
    def __init__(self, model: HitDetectorCNN):
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.model(x)).unsqueeze(1)  # (B, 1)


def export_onnx(model: HitDetectorCNN, path: str) -> None:
    """Export model with sigmoid baked in so ONNX output is always [0,1].

    Uses torch.export-based dynamo exporter (torch >= 2.9 default).
    Output tensor shape: (batch, 1), values in [0, 1].
    """
    wrapper = _SigmoidWrapper(model).cpu().eval()
    dummy = torch.randn(1, 31, model.features)
    # dynamo=True uses the new torch.export path (default in 2.9+);
    # verbose=False suppresses emoji-filled progress lines that break cp1252 consoles.
    torch.onnx.export(
        wrapper,
        (dummy,),
        f=path,
        input_names=["window"],
        output_names=["probability"],
        opset_version=17,
        dynamo=True,
        verbose=False,
        dynamic_shapes={"x": {0: torch.export.Dim("batch")}},
    )
