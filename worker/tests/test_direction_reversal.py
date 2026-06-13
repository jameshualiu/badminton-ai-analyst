"""Unit tests for the direction-reversal gate logic used in gap-based hit detection."""


def direction_reversed(vx_a, vy_a, vx_b, vy_b, min_speed=3.0):
    """
    Returns True if the shuttle's velocity meaningfully reversed direction.
    Mirrors the logic in BadmintonPipeline._detect_hits_from_traj.
    """
    speed_a = (vx_a ** 2 + vy_a ** 2) ** 0.5
    speed_b = (vx_b ** 2 + vy_b ** 2) ** 0.5
    if speed_a < min_speed or speed_b < min_speed:
        return False
    dot = vx_a * vx_b + vy_a * vy_b
    return dot < 0


def test_clear_reversal_is_hit():
    # Shuttle going down-right, then up-left after gap -- clear direction reversal
    assert direction_reversed(vx_a=5, vy_a=8, vx_b=-4, vy_b=-7) is True


def test_same_direction_is_not_hit():
    # Shuttle going down-right before gap, still going down-right after -- tracking loss
    assert direction_reversed(vx_a=5, vy_a=8, vx_b=4, vy_b=7) is False


def test_perpendicular_is_not_hit():
    # dot product = 0 exactly -- ambiguous, we treat as not-a-hit (dot < 0 required)
    assert direction_reversed(vx_a=1, vy_a=0, vx_b=0, vy_b=1) is False


def test_vertical_reversal_is_hit():
    # Shuttle going downward before gap, upward after -- lob or clear
    assert direction_reversed(vx_a=0, vy_a=10, vx_b=0, vy_b=-8) is True


def test_too_slow_before_gap_is_not_hit():
    # Speed before gap is below minimum -- unreliable velocity, reject
    assert direction_reversed(vx_a=0, vy_a=2, vx_b=0, vy_b=-8) is False


def test_too_slow_after_gap_is_not_hit():
    # Speed after gap is below minimum -- unreliable velocity, reject
    assert direction_reversed(vx_a=0, vy_a=8, vx_b=0, vy_b=-1) is False
