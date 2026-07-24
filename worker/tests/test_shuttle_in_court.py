"""Unit tests for shuttle court-bounds filtering.

Mirrors the logic in BadmintonPipeline._shuttle_in_court (worker/pipeline.py)
without importing the pipeline module (which pulls in heavy ML dependencies).
"""

SHUTTLE_COURT_PADDING_MIN_PX = 30.0
SHUTTLE_COURT_PADDING_FRAC = 0.15


def shuttle_in_court(pos, court_kp6, court_y_min_px, court_y_max_px):
    if pos is None:
        return False

    x, y = pos
    if not (court_y_min_px <= y <= court_y_max_px):
        return False

    if not court_kp6:
        return True

    TL, TR = court_kp6[0], court_kp6[1]
    BL, BR = court_kp6[4], court_kp6[5]

    denom = BL[1] - TL[1]
    if abs(denom) < 1:
        return True
    t = max(0.0, min(1.0, (y - TL[1]) / denom))
    left_x = TL[0] + t * (BL[0] - TL[0])
    right_x = TR[0] + t * (BR[0] - TR[0])

    padding = max(SHUTTLE_COURT_PADDING_MIN_PX,
                   SHUTTLE_COURT_PADDING_FRAC * (right_x - left_x))

    return left_x - padding <= x <= right_x + padding


def _angled_court_kp6():
    """An angled-camera court quad: narrow at the far end (small y), wide at
    the near end (large y) -- matches a low, angled club-camera shot."""
    TL, TR = [200, 60], [350, 60]
    BL, BR = [150, 280], [500, 280]
    return [TL, TR, None, None, BL, BR]


def _bounds(kp6):
    top_ys = [kp6[0][1], kp6[1][1]]
    bot_ys = [kp6[4][1], kp6[5][1]]
    return min(top_ys) - 120, max(bot_ys) + 30


def test_pos_none_is_not_in_court():
    kp6 = _angled_court_kp6()
    y_min, y_max = _bounds(kp6)
    assert shuttle_in_court(None, kp6, y_min, y_max) is False


def test_point_inside_court_passes():
    kp6 = _angled_court_kp6()
    y_min, y_max = _bounds(kp6)
    assert shuttle_in_court((275, 200), kp6, y_min, y_max) is True


def test_floor_shuttle_pile_outside_left_sideline_is_rejected():
    """A stray shuttle pile sitting on the floor to the left of the near
    sideline, at court-level y -- should be filtered out."""
    kp6 = _angled_court_kp6()
    y_min, y_max = _bounds(kp6)
    assert shuttle_in_court((30, 280), kp6, y_min, y_max) is False


def test_point_outside_right_sideline_is_rejected():
    kp6 = _angled_court_kp6()
    y_min, y_max = _bounds(kp6)
    assert shuttle_in_court((600, 280), kp6, y_min, y_max) is False


def test_high_clear_above_court_still_passes():
    """A clear/smash tracked above the top baseline (small/negative y) but
    within the court's x-span should still be considered in-play."""
    kp6 = _angled_court_kp6()
    y_min, y_max = _bounds(kp6)
    assert shuttle_in_court((275, -50), kp6, y_min, y_max) is True


def test_point_far_above_y_range_is_rejected():
    kp6 = _angled_court_kp6()
    y_min, y_max = _bounds(kp6)
    assert shuttle_in_court((275, -100), kp6, y_min, y_max) is False


def test_no_court_keypoints_does_not_filter():
    kp6 = _angled_court_kp6()
    y_min, y_max = _bounds(kp6)
    assert shuttle_in_court((30, 280), None, y_min, y_max) is True
