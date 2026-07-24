"""Mirrors BadmintonInference.__init__'s shot_clf load-fallback pattern
(inference.py line ~22) without importing inference.py, which transitively
pulls in torch/torchvision via detectors/court_detector.py.
"""


class RaisingShotClassifierAdapter:
    def __init__(self, weights_path):
        raise RuntimeError(f"corrupt ONNX file: {weights_path}")


class SucceedingShotClassifierAdapter:
    def __init__(self, weights_path):
        self.weights_path = weights_path


def load_shot_clf(lstm_path, adapter_cls):
    """Mirrors BadmintonInference.__init__'s shot_clf assignment block."""
    shot_clf = None
    if lstm_path:
        try:
            shot_clf = adapter_cls(lstm_path)
        except Exception as e:
            print(f"[lstm] WARNING: failed to load ({e}); using rule-based shot classification")
    return shot_clf


def test_load_succeeds_sets_shot_clf():
    shot_clf = load_shot_clf("weights/lstm.onnx", SucceedingShotClassifierAdapter)

    assert shot_clf is not None
    assert shot_clf.weights_path == "weights/lstm.onnx"


def test_load_failure_falls_back_to_none_instead_of_raising():
    # Should not raise, despite RaisingShotClassifierAdapter always throwing.
    shot_clf = load_shot_clf("weights/corrupt.onnx", RaisingShotClassifierAdapter)

    assert shot_clf is None


def test_no_lstm_path_skips_load_attempt():
    calls = []

    class TrackingAdapter:
        def __init__(self, weights_path):
            calls.append(weights_path)

    shot_clf = load_shot_clf(None, TrackingAdapter)

    assert shot_clf is None
    assert calls == []
