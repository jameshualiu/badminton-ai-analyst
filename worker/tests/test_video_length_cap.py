"""Mirrors process_video()'s frame-count/truncation logic (pipeline.py
line ~236-241) without importing pipeline.py, which transitively pulls in
torch/onnxruntime/decord. If you change this logic in pipeline.py, update
the mirrored copy here too.
"""


def resolve_total_frames(video_frame_count, limit_frames=None):
    """Mirrors process_video()'s total_frames/truncated computation."""
    total_frames = min(video_frame_count, limit_frames) if limit_frames else video_frame_count
    truncated = bool(limit_frames) and video_frame_count > limit_frames
    return total_frames, truncated


def test_no_limit_processes_the_full_video():
    total_frames, truncated = resolve_total_frames(video_frame_count=50000)

    assert total_frames == 50000
    assert truncated is False


def test_default_call_has_no_limit():
    # Mirrors process_video(video_path) with no limit_frames override --
    # the production call site in app.py.
    total_frames, truncated = resolve_total_frames(video_frame_count=50000, limit_frames=None)

    assert total_frames == 50000
    assert truncated is False


def test_explicit_limit_below_video_length_truncates():
    total_frames, truncated = resolve_total_frames(video_frame_count=50000, limit_frames=1800)

    assert total_frames == 1800
    assert truncated is True


def test_explicit_limit_above_video_length_is_not_truncated():
    total_frames, truncated = resolve_total_frames(video_frame_count=1000, limit_frames=1800)

    assert total_frames == 1000
    assert truncated is False


def test_explicit_limit_equal_to_video_length_is_not_truncated():
    total_frames, truncated = resolve_total_frames(video_frame_count=1800, limit_frames=1800)

    assert total_frames == 1800
    assert truncated is False
