"""Vertical/perspective-correction (P2) invariants.

The estimators are pure and tested directly with synthetic line sets; the warp
is checked for safe behaviour (no-op when straight, shape preserved). Visual
quality of the warp is validated on real renders on the Mac."""
import numpy as np

import geometry as geo


# lines are [x1,y1,x2,y2]
def vline(x_top, x_bot, h=100):
    return [x_top, 0, x_bot, h]


def test_skew_zero_for_perfectly_vertical_lines():
    lines = np.array([vline(50, 50), vline(120, 120), vline(180, 180)], float)
    assert abs(geo.vertical_skew_degrees(lines)) < 0.01


def test_skew_sign_convention_top_right_is_negative():
    # Convention: top to the right of bottom → negative skew (atan2(dx, dy) with
    # dx = x_bottom - x_top). straighten_verticals corrects by -skew.
    lines = np.array([vline(60, 50), vline(160, 150)], float)
    assert geo.vertical_skew_degrees(lines) < -1.0


def test_skew_empty_is_zero():
    assert geo.vertical_skew_degrees(np.empty((0, 4))) == 0.0


def test_keystone_zero_for_parallel_verticals():
    lines = np.array([vline(40, 40), vline(100, 100), vline(160, 160)], float)
    assert abs(geo.keystone_strength(lines, 100, 200)) < 0.02


def test_keystone_positive_when_top_converges():
    # Left line leans right at top, right line leans left at top → converging top.
    lines = np.array([vline(60, 30), vline(140, 170)], float)
    k = geo.keystone_strength(lines, 100, 200)
    assert k > 0.05


def test_keystone_sign_flips_for_diverging_top():
    lines = np.array([vline(30, 60), vline(170, 140)], float)  # top wider than bottom
    assert geo.keystone_strength(lines, 100, 200) < -0.05


def test_straighten_is_noop_without_lines():
    img = np.full((120, 160, 3), 127, np.uint8)  # featureless → no vertical lines
    out = geo.straighten_verticals(img)
    assert out.shape == img.shape
    assert np.array_equal(out, img)


def test_straighten_preserves_shape_and_dtype():
    rng = np.random.default_rng(0)
    img = rng.integers(0, 256, (160, 240, 3), dtype=np.uint8)
    # Pass explicit already-straight lines so the path runs but stays ~no-op.
    lines = np.array([vline(60, 60, 160), vline(180, 180, 160)], float)
    out = geo.straighten_verticals(img, lines=lines)
    assert out.shape == img.shape and out.dtype == np.uint8


def test_straighten_actually_reduces_a_real_tilt_end_to_end():
    # Upright bars, tilted by a known +6°, must come back substantially straighter
    # after detection + correction (proves the rotation sign is right).
    import cv2

    img = np.full((200, 300, 3), 40, np.uint8)
    for x in (60, 150, 240):
        img[:, x - 2 : x + 2] = 230
    M = cv2.getRotationMatrix2D((150, 100), 6.0, 1.0)
    tilted = cv2.warpAffine(img, M, (300, 200), borderMode=cv2.BORDER_REPLICATE)

    before = abs(geo.vertical_skew_degrees(geo.detect_vertical_lines(tilted)))
    fixed = geo.straighten_verticals(tilted, apply_keystone=False)
    after = abs(geo.vertical_skew_degrees(geo.detect_vertical_lines(fixed)))

    assert before > 4.0          # the tilt was detected
    assert after < before - 3.0  # and meaningfully corrected
    assert fixed.shape == tilted.shape
