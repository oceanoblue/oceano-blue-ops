"""Segmentation-mask invariants (window/sky). Synthetic frames only — no model,
no network. Guards the classical segmenter that drives window-pull (P1) and sky
replacement (P4)."""
import numpy as np
import pytest

import masks


def textured(h, w, base, amp=40, seed=0):
    """A textured fill (high local variance) so 'flat' tests are meaningful."""
    rng = np.random.default_rng(seed)
    noise = rng.integers(-amp, amp + 1, size=(h, w, 3))
    return np.clip(np.full((h, w, 3), base, np.int32) + noise, 0, 255).astype(np.uint8)


def test_window_mask_flags_a_bright_flat_block():
    # Dark textured room with a large bright FLAT window block in the middle.
    img = textured(200, 200, 60)
    img[60:140, 60:140] = 252  # blown, perfectly flat
    m = masks.window_mask(img)
    assert m.shape == (200, 200)
    assert m.dtype == np.float32
    assert m[100, 100] > 0.7          # inside the window → strong
    assert m[10, 10] < 0.2            # textured wall → not a window


def test_window_mask_ignores_tiny_specular_highlights():
    # A few small blown specks (reflections) must NOT register as windows.
    img = textured(200, 200, 70)
    img[20:24, 20:24] = 255
    img[150:153, 150:153] = 255
    m = masks.window_mask(img)
    assert float(m.max()) < 0.3       # below the sizeable-region bar


def test_window_mask_empty_on_a_flat_dark_scene():
    img = textured(120, 120, 50)
    assert float(masks.window_mask(img).max()) < 0.2


def test_sky_mask_flags_top_blue_band_only():
    img = textured(200, 200, 80)            # textured "ground"
    img[:90, :] = np.array([235, 200, 150], np.uint8)  # flat blue-ish sky (B>G>R)
    m = masks.sky_mask(img)
    assert m[10, 100] > 0.6                  # top → sky
    assert m[180, 100] < 0.2                 # bottom → not sky


def test_sky_mask_ignores_bright_wall_not_touching_top():
    # A blown flat block in the LOWER half must not count as sky (not top-anchored).
    img = textured(200, 200, 70)
    img[120:170, 60:140] = 250
    assert float(masks.sky_mask(img).max()) < 0.3


def test_local_std_low_on_flat_high_on_texture():
    flat = np.full((64, 64), 128, np.float32)
    assert float(masks.local_std(flat).mean()) < 1.0
    noisy = textured(64, 64, 128)[..., 0].astype(np.float32)
    assert float(masks.local_std(noisy).mean()) > 5.0


def test_masks_are_normalised_0_1():
    img = textured(120, 120, 60)
    img[40:90, 40:90] = 250
    for m in (masks.window_mask(img), masks.sky_mask(img)):
        assert m.min() >= 0.0 and m.max() <= 1.0 + 1e-6
