"""Mirrors BadmintonPipeline's BST-classifier runtime-failure fallback
(pipeline.py process_video's try/except around bst_clf.classify_hits, and
_classify_hits' use_lstm decision) without importing pipeline.py, which
pulls in torch/onnxruntime/decord and requires real model weights.
"""


class FakeEngine:
    def __init__(self, shot_clf=None, bst_clf=None):
        self.shot_clf = shot_clf
        self.bst_clf = bst_clf


def use_lstm_decision(engine, force_lstm=False):
    """Mirrors _classify_hits' use_lstm computation (pipeline.py)."""
    return force_lstm or (engine.shot_clf is not None and getattr(engine, "bst_clf", None) is None)


def classify_hits_with_bst_fallback(engine, hits, player_tracking, shuttle_traj, fps,
                                     pixel_to_meters, classify_hits_fn):
    """Mirrors process_video's BST-override block (pipeline.py lines ~248-256)."""
    if getattr(engine, "bst_clf", None) is not None and hits:
        try:
            hits = engine.bst_clf.classify_hits(hits, shuttle_traj, player_tracking, fps, pixel_to_meters)
        except Exception as e:
            print(f"[bst] WARNING: classify_hits failed at runtime ({e}); "
                  f"falling back to LSTM/rule-based classification")
            hits = classify_hits_fn(hits, player_tracking, shuttle_traj, force_lstm=True)
    return hits


class RaisingBstClf:
    def classify_hits(self, hits, shuttle_traj, player_tracking, fps, pixel_to_meters):
        raise RuntimeError("mismatched tensor shape")


class SucceedingBstClf:
    def classify_hits(self, hits, shuttle_traj, player_tracking, fps, pixel_to_meters):
        for h in hits:
            h["type"] = "Smash"
            h["side"] = "Top"
        return hits


def test_bst_success_does_not_fall_back():
    engine = FakeEngine(bst_clf=SucceedingBstClf())
    hits = [{"frame": 10, "type": "Clear"}]
    fallback_calls = []

    def classify_hits_fn(hits, player_tracking, shuttle_traj, force_lstm=False):
        fallback_calls.append(force_lstm)
        return hits

    result = classify_hits_with_bst_fallback(
        engine, hits, [], [], 30, lambda x, y: None, classify_hits_fn)

    assert result[0]["type"] == "Smash"
    assert result[0]["side"] == "Top"
    assert fallback_calls == []


def test_bst_runtime_failure_falls_back_instead_of_raising():
    engine = FakeEngine(bst_clf=RaisingBstClf())
    hits = [{"frame": 10, "type": "Clear"}]
    fallback_calls = []

    def classify_hits_fn(hits, player_tracking, shuttle_traj, force_lstm=False):
        fallback_calls.append(force_lstm)
        for h in hits:
            h["type"] = "Drop"
        return hits

    # Should not raise, despite RaisingBstClf always throwing.
    result = classify_hits_with_bst_fallback(
        engine, hits, [], [], 30, lambda x, y: None, classify_hits_fn)

    assert fallback_calls == [True]
    assert result[0]["type"] == "Drop"


def test_no_bst_clf_skips_the_block_entirely():
    engine = FakeEngine(bst_clf=None)
    hits = [{"frame": 10, "type": "Clear"}]
    fallback_calls = []

    def classify_hits_fn(hits, player_tracking, shuttle_traj, force_lstm=False):
        fallback_calls.append(force_lstm)
        return hits

    result = classify_hits_with_bst_fallback(
        engine, hits, [], [], 30, lambda x, y: None, classify_hits_fn)

    assert result[0]["type"] == "Clear"
    assert fallback_calls == []


def test_empty_hits_short_circuits_without_calling_bst():
    calls = []

    class TrackingBstClf:
        def classify_hits(self, *args, **kwargs):
            calls.append(1)
            return []

    engine = FakeEngine(bst_clf=TrackingBstClf())

    result = classify_hits_with_bst_fallback(
        engine, [], [], [], 30, lambda x, y: None, lambda *a, **k: [])

    assert result == []
    assert calls == []


def test_use_lstm_forced_even_when_bst_is_loaded():
    engine = FakeEngine(shot_clf=object(), bst_clf=object())

    assert use_lstm_decision(engine, force_lstm=True) is True


def test_use_lstm_skipped_when_bst_loaded_and_not_forced():
    engine = FakeEngine(shot_clf=object(), bst_clf=object())

    assert use_lstm_decision(engine, force_lstm=False) is False


def test_use_lstm_used_when_available_and_no_bst():
    engine = FakeEngine(shot_clf=object(), bst_clf=None)

    assert use_lstm_decision(engine, force_lstm=False) is True


def test_use_lstm_false_when_no_lstm_and_no_bst():
    engine = FakeEngine(shot_clf=None, bst_clf=None)

    assert use_lstm_decision(engine, force_lstm=False) is False
