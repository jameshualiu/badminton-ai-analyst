"""Unit tests for the HD/SD coordinate-scaling logic used to move player
boxes/skeletons and court keypoints between the 512x288 (SD/TrackNet) and
1280x720 (HD/pose) readers. Mirrors BadmintonPipeline._scale_player and the
sx, sy = HD_W / SD_W, HD_H / SD_H derivation in pipeline.py's process_video,
without importing pipeline.py, which pulls in torch/onnxruntime/decord and
requires real model weights.
"""

import pytest


def compute_scale_factors(sd_w, sd_h, hd_w, hd_h):
    """Mirrors process_video's sx, sy = HD_W / SD_W, HD_H / SD_H."""
    return hd_w / sd_w, hd_h / sd_h


def scale_player(player, sx, sy):
    """Mirrors BadmintonPipeline._scale_player."""
    box = player.get("box", [])
    skel = player.get("skeleton", [])
    return {
        **player,
        "box": [box[0]*sx, box[1]*sy, box[2]*sx, box[3]*sy] if len(box) == 4 else box,
        "skeleton": [[kp[0]*sx, kp[1]*sy] for kp in skel],
    }


def test_compute_scale_factors_nominal_resolutions():
    sx, sy = compute_scale_factors(512, 288, 1280, 720)
    assert sx == 2.5
    assert sy == 2.5


def test_compute_scale_factors_non_uniform_when_decoded_dims_dont_match_nominal():
    # Odd source aspect ratio can make decord round SD/HD dims differently,
    # so sx and sy must not be assumed equal.
    sx, sy = compute_scale_factors(510, 288, 1280, 718)
    assert sx != sy
    assert sx == 1280 / 510
    assert sy == 718 / 288


def test_scale_player_scales_box_and_skeleton_independently_per_axis():
    player = {
        "box": [10, 20, 30, 40],
        "skeleton": [[1, 2], [3, 4]],
    }
    result = scale_player(player, sx=2.0, sy=3.0)

    assert result["box"] == [20, 60, 60, 120]
    assert result["skeleton"] == [[2, 6], [6, 12]]


def test_scale_player_leaves_malformed_box_untouched_but_still_scales_skeleton():
    player = {"box": [], "skeleton": [[1, 2]]}
    result = scale_player(player, sx=2.0, sy=3.0)

    assert result["box"] == []
    assert result["skeleton"] == [[2, 6]]


def test_scale_player_handles_empty_skeleton():
    player = {"box": [10, 20, 30, 40], "skeleton": []}
    result = scale_player(player, sx=2.0, sy=2.0)

    assert result["skeleton"] == []


def test_scale_player_preserves_unrelated_fields():
    player = {"box": [10, 20, 30, 40], "skeleton": [], "conf": 0.87, "id": 1}
    result = scale_player(player, sx=2.0, sy=2.0)

    assert result["conf"] == 0.87
    assert result["id"] == 1


def test_scale_player_round_trip_recovers_original_coordinates():
    # This is the actual pattern in process_video: kp6 is scaled SD->HD by
    # (sx, sy), and player boxes/skeletons are scaled back HD->SD by
    # (1/sx, 1/sy). A bug in either direction should surface here.
    original = {
        "box": [12.0, 34.0, 56.0, 78.0],
        "skeleton": [[5.0, 6.0], [7.0, 8.0]],
    }
    sx, sy = compute_scale_factors(510, 288, 1280, 718)

    scaled_up = scale_player(original, sx, sy)
    scaled_back = scale_player(scaled_up, 1.0 / sx, 1.0 / sy)

    assert scaled_back["box"] == pytest.approx(original["box"])
    flat_original = [c for kp in original["skeleton"] for c in kp]
    flat_scaled_back = [c for kp in scaled_back["skeleton"] for c in kp]
    assert flat_scaled_back == pytest.approx(flat_original)
