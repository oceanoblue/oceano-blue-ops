"""Sky-replacement (P4) invariants — profile gating + masked compositing."""
import numpy as np

import sky as skymod
from masks import luminance


def scene(h=200, w=200):
    """Blown-white sky on top, textured ground below."""
    rng = np.random.default_rng(0)
    img = np.clip(np.full((h, w, 3), 70, np.int32) + rng.integers(-35, 36, (h, w, 3)), 0, 255).astype(np.uint8)
    img[: h // 2, :] = 250  # flat blown sky, top-anchored
    return img


def test_sober_profile_is_left_untouched():
    img = scene()
    out = skymod.replace_sky(img, style="sober")
    assert np.array_equal(out, img)  # faithful tiers never get an invented sky


def test_default_profile_replaces_blown_sky():
    img = scene()
    before = luminance(img)[:50, :].mean()  # ~250 (blown white)
    out = skymod.replace_sky(img, style="default")
    after = luminance(out)[:50, :].mean()
    assert out.shape == img.shape
    assert after < before - 15  # blown white → graded sky (less luminous, tinted)


def test_ground_is_preserved():
    img = scene()
    out = skymod.replace_sky(img, style="default")
    # Bottom quarter is ground (not sky, not blown) → essentially unchanged.
    assert np.abs(out[160:, :].astype(int) - img[160:, :].astype(int)).mean() < 3


def test_noop_when_no_sky():
    rng = np.random.default_rng(1)
    img = np.clip(np.full((150, 150, 3), 90, np.int32) + rng.integers(-30, 31, (150, 150, 3)), 0, 255).astype(np.uint8)
    out = skymod.replace_sky(img, style="default")
    assert np.abs(out.astype(int) - img.astype(int)).max() <= 2


def test_supplied_sky_image_is_used_and_resized():
    img = scene()
    custom = np.zeros((10, 10, 3), np.uint8)
    custom[:] = (200, 120, 60)  # a distinct blue
    out = skymod.replace_sky(img, style="default", sky=custom)
    # The blown sky region should pick up the supplied blue (B high, R low-ish).
    top = out[:40, :].reshape(-1, 3).mean(axis=0)
    assert top[0] > top[2]  # B > R → took on the supplied sky's tint
    assert out.shape == img.shape


def test_procedural_sky_is_a_vertical_gradient():
    g = skymod.procedural_sky(100, 20)
    assert g.shape == (100, 20, 3) and g.dtype == np.uint8
    # Top azure (B>R), easing to paler haze at the bottom (R rises).
    assert g[0, 0, 0] > g[0, 0, 2]
    assert g[99, 0, 2] > g[0, 0, 2]
