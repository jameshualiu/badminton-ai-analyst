"""
Regression guard for SEC-02: which torch.load() call sites use
weights_only=True vs False in the checkpoint loaders.

Source-inspection rather than execution/import -- importing torch here costs
~15s for no behavioral coverage a static check doesn't already give (and this
repo's worker tests deliberately avoid pulling in torch, see CLAUDE.md).
"""
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent.parent


def _load_call_lines(path):
    src = path.read_text()
    return [
        (i + 1, line.strip())
        for i, line in enumerate(src.splitlines())
        if "torch.load(" in line
    ]


def test_tracknet_v3_checkpoint_loads_use_weights_only_true():
    calls = _load_call_lines(WORKER_DIR / "detectors" / "tracknet_v3.py")

    assert len(calls) == 2, f"expected 2 torch.load() calls in tracknet_v3.py, found {len(calls)}"
    for lineno, line in calls:
        assert "weights_only=True" in line, f"tracknet_v3.py:{lineno} must use weights_only=True: {line}"


def test_court_detector_full_model_load_stays_weights_only_false():
    calls = _load_call_lines(WORKER_DIR / "detectors" / "court_detector.py")
    helper_call = next(l for _, l in calls if l.startswith("return torch.load"))

    # _load_model() loads a full pickled model object (court_kpRCNN.pth /
    # net_kpRCNN.pth) -- weights_only=True can't unpickle that.
    assert "weights_only=False" in helper_call, f"_load_model()'s torch.load must stay weights_only=False: {helper_call}"


def test_court_detector_legacy_tracknet_state_dict_load_uses_weights_only_true():
    calls = _load_call_lines(WORKER_DIR / "detectors" / "court_detector.py")
    state_dict_call = next(l for _, l in calls if l.startswith("state = torch.load"))

    assert "weights_only=True" in state_dict_call, (
        f"legacy TrackNet state-dict load must use weights_only=True: {state_dict_call}"
    )


def test_no_stray_weights_only_false_introduced():
    tracknet_v3_calls = _load_call_lines(WORKER_DIR / "detectors" / "tracknet_v3.py")
    court_detector_calls = _load_call_lines(WORKER_DIR / "detectors" / "court_detector.py")

    false_calls = [
        line for _, line in tracknet_v3_calls + court_detector_calls if "weights_only=False" in line
    ]
    assert len(false_calls) == 1, (
        "expected exactly one intentional weights_only=False (the full-model _load_model() helper); "
        f"found: {false_calls}"
    )
