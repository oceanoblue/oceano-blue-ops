"""Window-pull (P1) invariants — synthetic brackets only."""
import numpy as np

import window_pull as wp
from masks import luminance


def textured(h, w, base, amp=40, seed=0):
    rng = np.random.default_rng(seed)
    noise = rng.integers(-amp, amp + 1, size=(h, w, 3))
    return np.clip(np.full((h, w, 3), base, np.int32) + noise, 0, 255).astype(np.uint8)


def solid(bgr, h=80, w=80):
    img = np.zeros((h, w, 3), np.uint8)
    img[:] = np.array(bgr, np.uint8)
    return img


def test_pick_darkest_returns_lowest_median():
    dark, mid, bright = solid((40, 40, 40)), solid((120, 120, 120)), solid((220, 220, 220))
    out = wp.pick_darkest([bright, dark, mid])
    assert np.array_equal(out, dark)


def test_window_pull_recovers_a_blown_window_from_the_dark_frame():
    # Fused: dark textured room with a large BLOWN-white window block.
    fused = textured(200, 200, 60)
    fused[60:140, 60:140] = 252
    # Dark frame: same room, but the window block holds a real (mid-tone) view.
    darkest = textured(200, 200, 55)
    darkest[60:140, 60:140] = 130

    before = float(luminance(fused)[80:120, 80:120].mean())  # ~252
    out = wp.window_pull(fused, darkest)
    after = float(luminance(out)[80:120, 80:120].mean())

    assert after < before - 60          # window recovered toward the darker view
    assert after <= 170                  # clearly no longer blown white


def test_window_pull_leaves_a_correctly_exposed_room_untouched():
    # Room is mid-tone and textured (not blown, not a window) → mask+blown weight
    # are ~0 there, so those pixels must be essentially unchanged.
    fused = textured(200, 200, 60)
    fused[60:140, 60:140] = 252
    darkest = textured(200, 200, 30)
    darkest[60:140, 60:140] = 130
    out = wp.window_pull(fused, darkest)
    # A corner well away from the window:
    assert np.abs(out[:40, :40].astype(int) - fused[:40, :40].astype(int)).mean() < 3


def test_window_pull_noop_without_a_window():
    fused = textured(160, 160, 70)       # nothing blown, no flat bright block
    darkest = textured(160, 160, 40)
    out = wp.window_pull(fused, darkest)
    assert np.abs(out.astype(int) - fused.astype(int)).max() <= 2


def test_window_pull_resizes_mismatched_dark_frame_and_keeps_shape():
    fused = textured(200, 200, 60)
    fused[60:140, 60:140] = 252
    darkest = textured(100, 100, 50)     # half-size bracket
    darkest[30:70, 30:70] = 130
    out = wp.window_pull(fused, darkest)
    assert out.shape == fused.shape and out.dtype == np.uint8
