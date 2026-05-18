# Shuttle Tracking & Shot Detection Improvement

**Date:** 2026-05-18  
**Status:** Approved

## Problem

Shot detection produces two categories of false positives:

1. **Inter-rally gaps** — when the shuttle disappears for a long time (pickup, service, break), the gap detector fires a false hit.
2. **Mid-rally tracking loss** — when TrackNet briefly loses the shuttle mid-flight and it reappears travelling in the same direction, the gap detector fires a false hit because it has no direction-reversal check.

Both are compounded by the TrackNet confidence threshold being too high (0.5), which creates more artificial gaps than necessary.

## Scope

All changes are in `worker/pipeline.py`. No model changes, no frontend changes, no schema changes.

## Design

### 1. Lower shuttle tracking confidence threshold

**File:** `pipeline.py` — `_track_shuttle_all_frames`  
**Change:** Confidence threshold `0.5 → 0.35`

TrackNet heatmap confidence drops for fast-moving or distant shuttles. Lowering to 0.35 captures more valid frames, reducing the number of artificial gaps that feed false hit detection.

### 2. Tighten gap detection parameters

**File:** `pipeline.py` — `_detect_hits_from_traj`  
**Changes:**

| Parameter | Before | After | Reason |
|-----------|--------|-------|--------|
| `MIN_HIT_GAP` | 5 frames | 8 frames | Gaps under 8 frames are TrackNet noise, not hits |
| `MAX_HIT_GAP` | 90 frames | 50 frames | Gaps over 50 frames (~1.7s) are inter-rally pauses, not hits |

### 3. Direction-reversal gate

**File:** `pipeline.py` — `_detect_hits_from_traj`  
**Change:** Add a mandatory direction check for each candidate gap hit.

After computing velocity vectors before the gap (`vx_a, vy_a`) and after (`vx_b, vy_b`), require that the dot product is negative:

```
dot = vx_a * vx_b + vy_a * vy_b
if dot >= 0:
    reject  # shuttle still going same direction — tracking loss, not a hit
```

A real hit reverses the shuttle's direction. If the dot product is non-negative, the shuttle was travelling in the same general direction before and after the gap — this is a tracking loss, not a contact event.

### 4. Raise wrist speed threshold

**File:** `pipeline.py` — `_detect_hits_from_pose`  
**Change:** `MIN_WRIST_SPEED` `15 → 22` px/frame

At 15 px/frame, normal arm movement during footwork and recovery triggers false pose hits. 22 px/frame requires a genuine swing while still capturing real contact points.

## Success Criteria

- False hits during inter-rally pauses are eliminated
- False hits from mid-rally tracking loss are substantially reduced
- Real hits (verified by shuttle direction reversal) are still detected
- Shot log count drops significantly on existing test videos
