"""Unit tests for hit location refinement and Top/Bottom player sort order.

Mirrors the logic in BadmintonPipeline._foot_pixel, ._player_sort_key, and
._refine_locations_by_side (worker/pipeline.py) without importing the
pipeline module (which pulls in heavy ML dependencies).
"""

import cv2
import numpy as np

COURT_WIDTH, COURT_HEIGHT = 6.1, 13.4
TARGET_CORNERS = np.array([
    [0, 0],
    [COURT_WIDTH, 0],
    [COURT_WIDTH, COURT_HEIGHT],
    [0, COURT_HEIGHT],
], dtype="float32")


def pixel_to_meters(H, x, y):
    if H is None or x is None or y is None:
        return None
    point = np.array([[[x, y]]], dtype="float32")
    return cv2.perspectiveTransform(point, H)[0][0].tolist()


def foot_pixel(player):
    sk = player.get("skeleton", [])
    la = sk[15] if len(sk) > 15 else None
    ra = sk[16] if len(sk) > 16 else None
    if la and ra and (la[0] or la[1]) and (ra[0] or ra[1]):
        return (la[0] + ra[0]) / 2, (la[1] + ra[1]) / 2
    box = player.get("box", [])
    if len(box) == 4:
        return (box[0] + box[2]) / 2, box[3]
    return None, None


def player_sort_key(H, player):
    fx, fy = foot_pixel(player)
    if fx is not None:
        court = pixel_to_meters(H, fx, fy)
        if court is not None:
            return court[1]
    box = player.get("box", [])
    return box[1] if len(box) == 4 else 999


def refine_locations_by_side(H, hits, player_tracking):
    tracking_by_frame = {entry["frame"]: entry["players"] for entry in player_tracking}

    for hit in hits:
        side = hit.get("side")
        if side not in ("Top", "Bottom"):
            continue

        players_at_hit = tracking_by_frame.get(hit["frame"], [])
        target_idx = 0 if side == "Top" else 1
        if len(players_at_hit) <= target_idx:
            continue

        fx, fy = foot_pixel(players_at_hit[target_idx])
        if fx is None:
            continue

        loc = pixel_to_meters(H, fx, fy)
        if loc is not None:
            hit["location_m"] = loc

    return hits


def _square_homography():
    """A simple, axis-aligned trapezoid -> court-rect homography."""
    quad = np.array([[100, 50], [300, 50], [300, 250], [100, 250]], dtype="float32")
    H, _ = cv2.findHomography(quad, TARGET_CORNERS)
    return H


def _skewed_homography():
    """A rotated/skewed quad where pixel-y order and court-y order diverge."""
    quad = np.array([[100, 80], [400, 120], [450, 300], [50, 280]], dtype="float32")
    H, _ = cv2.findHomography(quad, TARGET_CORNERS)
    return H


def _player(ax, ay, box):
    skeleton = [[0, 0]] * 17
    skeleton[15] = [ax, ay]
    skeleton[16] = [ax, ay]
    return {"skeleton": skeleton, "box": box, "conf": 0.9}


def test_refine_top_side_keeps_correct_location():
    H = _square_homography()
    top = _player(150, 80, [120, 60, 180, 100])
    bottom = _player(200, 220, [170, 180, 230, 240])
    player_tracking = [{"frame": 10, "players": [top, bottom]}]

    expected = pixel_to_meters(H, *foot_pixel(top))
    hits = [{"frame": 10, "side": "Top", "location_m": expected}]

    refine_locations_by_side(H, hits, player_tracking)
    assert hits[0]["location_m"] == expected


def test_refine_bottom_side_corrects_wrong_location():
    H = _square_homography()
    top = _player(150, 80, [120, 60, 180, 100])
    bottom = _player(200, 220, [170, 180, 230, 240])
    player_tracking = [{"frame": 10, "players": [top, bottom]}]

    wrong = pixel_to_meters(H, *foot_pixel(top))  # location_m from wrong player
    hits = [{"frame": 10, "side": "Bottom", "location_m": wrong}]

    refine_locations_by_side(H, hits, player_tracking)
    expected = pixel_to_meters(H, *foot_pixel(bottom))
    assert hits[0]["location_m"] == expected
    assert hits[0]["location_m"] != wrong


def test_refine_unknown_side_unchanged():
    H = _square_homography()
    top = _player(150, 80, [120, 60, 180, 100])
    player_tracking = [{"frame": 10, "players": [top]}]
    hits = [{"frame": 10, "side": None, "location_m": [1.0, 2.0]}]

    refine_locations_by_side(H, hits, player_tracking)
    assert hits[0]["location_m"] == [1.0, 2.0]


def test_refine_missing_player_for_side_unchanged():
    H = _square_homography()
    top = _player(150, 80, [120, 60, 180, 100])
    player_tracking = [{"frame": 10, "players": [top]}]  # only 1 player tracked
    hits = [{"frame": 10, "side": "Bottom", "location_m": [1.0, 2.0]}]

    refine_locations_by_side(H, hits, player_tracking)
    assert hits[0]["location_m"] == [1.0, 2.0]


def test_player_sort_key_orders_by_court_y():
    H = _square_homography()
    top = _player(150, 80, [120, 60, 180, 100])
    bottom = _player(200, 220, [170, 180, 230, 240])

    players = [bottom, top]
    players.sort(key=lambda p: player_sort_key(H, p))
    assert players[0] is top
    assert players[1] is bottom


def test_player_sort_key_uses_court_y_not_pixel_y():
    """Under a skewed homography, pixel-y and court-y orderings can diverge.
    Sorting must follow court-y (the BST reference's "Top before Bottom"
    criterion), not raw pixel-y."""
    H = _skewed_homography()
    a = _player(380, 130, [360, 110, 400, 130])  # smaller court-y, larger pixel-y
    b = _player(90, 100, [70, 80, 110, 100])     # larger court-y, smaller pixel-y

    a_court_y = pixel_to_meters(H, *foot_pixel(a))[1]
    b_court_y = pixel_to_meters(H, *foot_pixel(b))[1]

    # Sanity check: this homography really does produce a pixel-y / court-y
    # order disagreement for these two points.
    assert foot_pixel(a)[1] > foot_pixel(b)[1]   # a is "below" b in pixels
    assert a_court_y < b_court_y                 # but a is "Top" in court coords

    players = [b, a]
    players.sort(key=lambda p: player_sort_key(H, p))
    assert players[0] is a
    assert players[1] is b
