"""
Grade-math invariants for the Oceano edit engine (worker-edit/server.py).

WHY THIS EXISTS — the photo-quality tuning loop runs by editing the grade
parameters in server.py and `fly deploy`-ing, then judging real rendered output
(see docs/HANDOFF-photo-quality.md §6). Renders can't happen in CI / the dev
sandbox, so these tests lock in the *mathematical* properties each function is
supposed to have. They don't judge taste — they catch regressions (a curve that
stops being monotonic, an exposure gain that breaks its clamp, a white balance
that drifts the wrong way), so every tuning iteration ships on a green floor.

Pure NumPy/OpenCV — no network, no Fly, no model calls. Run:
    cd worker-edit && pip install -r requirements.txt pytest && pytest -q
"""

import numpy as np
import pytest

import server


# ── helpers ──────────────────────────────────────────────────────────────────
def solid(bgr, h=64, w=64):
    """A flat HxW image of one BGR colour (uint8)."""
    img = np.zeros((h, w, 3), np.uint8)
    img[:] = np.array(bgr, np.uint8)
    return img


def luminance(img):
    b, g, r = img[..., 0].astype(np.float32), img[..., 1].astype(np.float32), img[..., 2].astype(np.float32)
    return 0.114 * b + 0.587 * g + 0.299 * r


# ── tone_curve ────────────────────────────────────────────────────────────────
def _lut(**kw):
    """Recover the 256-entry LUT tone_curve applies, by grading a 1x256 ramp."""
    ramp = np.arange(256, dtype=np.uint8).reshape(1, 256, 1).repeat(3, axis=2)
    out = server.tone_curve(ramp, **kw)
    return out[0, :, 0].astype(int)


def test_tone_curve_monotonic_nondecreasing():
    for kw in (
        dict(),  # defaults
        dict(black_point=1.0, contrast=0.94, airy_gamma=0.82, highlight_rolloff=0.35),  # sober (v3)
    ):
        lut = _lut(**kw)
        assert np.all(np.diff(lut) >= 0), f"tone curve must be monotonic for {kw}"


def test_tone_curve_white_stays_bright_and_topmost_with_rolloff():
    # The sober de-contrast (0.94) intentionally lands peak white just under 255
    # (~247) for an airy, un-clipped white — NOT a dingy grey. Invariant: the
    # brightest input is still the brightest output and stays near-white.
    lut = _lut(black_point=1.0, contrast=0.94, airy_gamma=0.82, highlight_rolloff=0.35)
    assert lut[255] == lut.max()
    assert lut[255] >= 240  # near-white, not dimmed


def test_tone_curve_black_point_clips_low_values():
    # Values at/below the black point map to 0 (just-off-muddy shadows).
    lut = _lut(black_point=4.0, contrast=1.0, airy_gamma=1.0, highlight_rolloff=0.0)
    assert lut[0] == 0
    assert lut[4] == 0
    assert lut[5] > 0


def test_airy_gamma_lifts_midtones():
    # gamma < 1 brightens the midtones (the "airy" lift). With no other shaping,
    # a mid input must come out brighter than it went in.
    lut = _lut(black_point=0.0, contrast=1.0, airy_gamma=0.88, highlight_rolloff=0.0)
    assert lut[128] > 128


def test_highlight_rolloff_compresses_highs_but_keeps_separation():
    base = _lut(black_point=1.0, contrast=0.94, airy_gamma=0.82, highlight_rolloff=0.0)
    rolled = _lut(black_point=1.0, contrast=0.94, airy_gamma=0.82, highlight_rolloff=0.35)
    # Above the knee, the shoulder pulls values DOWN (holds window detail)…
    assert rolled[245] <= base[245]
    # …without collapsing them to a flat white: bright tones stay distinct.
    assert rolled[230] < rolled[252]


# ── auto_exposure ─────────────────────────────────────────────────────────────
def test_auto_exposure_neutral_when_already_on_target():
    # Median already at the target (128/255 ≈ 0.502 ~ target 0.50) → gain ≈ 1.
    img = solid((128, 128, 128))
    out = server.auto_exposure(img, target=128 / 255.0)
    assert abs(float(np.median(luminance(out))) - 128) <= 1


def test_auto_exposure_lifts_dark_scene_toward_target():
    img = solid((80, 80, 80))
    out = server.auto_exposure(img, target=0.50)
    assert float(np.median(luminance(out))) > 80  # brighter, toward 0.50*255≈128


def test_auto_exposure_gain_is_clamped():
    # Near-black must not be manufactured into a scene: gain capped at 2.2×.
    dark = solid((10, 10, 10))
    assert float(np.median(luminance(server.auto_exposure(dark, target=0.50)))) <= 10 * 2.2 + 1
    # Over-bright merges darken, but no more than 0.6×.
    bright = solid((240, 240, 240))
    assert float(np.median(luminance(server.auto_exposure(bright, target=0.50)))) >= 240 * 0.6 - 1


def test_auto_exposure_preserves_colour_ratio():
    # Multiplicative gain → channel ratios (hue) are unchanged.
    img = solid((40, 80, 120))  # B:G:R = 1:2:3
    out = server.auto_exposure(img, target=0.50)
    b, g, r = float(out[..., 0].mean()), float(out[..., 1].mean()), float(out[..., 2].mean())
    assert g / b == pytest.approx(2.0, abs=0.05)
    assert r / b == pytest.approx(3.0, abs=0.05)


# ── auto_white_balance ────────────────────────────────────────────────────────
def test_awb_corrects_green_tint_toward_neutral():
    # A bright should-be-white patch carrying a green cast must come out closer to
    # neutral (the three channel means converge).
    img = solid((200, 230, 200))  # green-tinted "white"
    out = server.auto_white_balance(img)
    b, g, r = float(out[..., 0].mean()), float(out[..., 1].mean()), float(out[..., 2].mean())
    spread_before = 230 - 200
    spread_after = max(b, g, r) - min(b, g, r)
    assert spread_after < spread_before


def test_awb_gains_are_bounded():
    # Even an extreme cast can't push a channel past the [0.80, 1.25] clamp, so WB
    # never wildly recolours the frame.
    img = solid((120, 240, 120))  # strong green
    out = server.auto_white_balance(img).astype(np.float32)
    src = img.astype(np.float32)
    for c in range(3):
        ratio = out[..., c].mean() / max(src[..., c].mean(), 1e-6)
        assert 0.80 - 1e-3 <= ratio <= 1.25 + 1e-3


def test_awb_excludes_blue_sky_and_keeps_whites_neutral():
    # Real-estate exterior: a bright BLUE SKY plus a bright NEUTRAL surface (white
    # trim / cloud / driveway). The sky is the documented trap — anchoring on it
    # neutralises blue and drifts the whole frame WARM. The neutral filter must
    # exclude the sky (blue-dominant) and anchor on the true neutral, so whites
    # stay neutral. (When NO bright neutral exists the engine deliberately falls
    # back to a gentle bright-only blend — covered by the gain-clamp test.)
    img = solid((245, 205, 180), h=64, w=64)         # bright blue sky (B>G>R)
    img[:, 40:] = np.array((240, 240, 240), np.uint8)  # bright neutral white surface
    out = server.auto_white_balance(img)
    white = out[:, 48:62]  # sample the should-be-white region
    b, g, r = float(white[..., 0].mean()), float(white[..., 1].mean()), float(white[..., 2].mean())
    # Stays neutral: channels close together, and NOT a warm cast (R not > B).
    assert max(b, g, r) - min(b, g, r) <= 12
    assert r <= b + 6


# ── saturate / sharpen / soften_sky ───────────────────────────────────────────
def test_saturate_zero_is_greyscale():
    img = solid((40, 90, 160))
    out = server.saturate(img, 0.0)
    assert float(out[..., 0].std()) < 1 and abs(float(out[..., 0].mean()) - float(out[..., 2].mean())) <= 2


def test_sharpen_is_near_identity_on_flat_image():
    img = solid((123, 123, 123))
    out = server.sharpen(img, amount=0.25)
    assert np.abs(out.astype(int) - img.astype(int)).max() <= 1


def test_soften_sky_lifts_only_blue_hues():
    sky = solid((220, 150, 110))   # blue-dominant (sky)
    wall = solid((110, 150, 220))  # red-dominant (NOT sky)
    sky_v_before = luminance(sky).mean()
    sky_out = server.soften_sky(sky)
    wall_out = server.soften_sky(wall)
    assert luminance(sky_out).mean() >= sky_v_before  # sky lifted (or unchanged)
    # Non-sky hues untouched (±1 from the HSV<->BGR integer round-trip only).
    assert np.abs(wall_out.astype(int) - wall.astype(int)).max() <= 1


# ── correct_lens / fuse / resize ──────────────────────────────────────────────
def test_correct_lens_noop_when_k1_zero():
    img = solid((100, 120, 140))
    assert np.array_equal(server.correct_lens(img, k1=0.0), img)


def test_correct_lens_keeps_shape():
    img = solid((100, 120, 140), h=80, w=120)
    assert server.correct_lens(img, k1=-0.16).shape == img.shape


def test_fuse_single_image_is_identity():
    img = solid((90, 110, 130))
    assert np.array_equal(server.fuse([img]), img)


def test_fuse_multi_returns_uint8_same_shape():
    imgs = [solid((60, 60, 60)), solid((180, 180, 180))]
    out = server.fuse(imgs)
    assert out.dtype == np.uint8 and out.shape == imgs[0].shape


def test_resize_long_edge_noop_and_downscale():
    img = solid((10, 20, 30), h=100, w=200)
    assert server.resize_long_edge(img, 0) is img           # 0 = keep native
    assert server.resize_long_edge(img, 500) is img         # never upscale
    out = server.resize_long_edge(img, 100)                 # downscale long edge → 100
    assert max(out.shape[:2]) == 100


# ── grade end-to-end ──────────────────────────────────────────────────────────
@pytest.mark.parametrize("style", ["default", "sober"])
def test_grade_outputs_valid_image(style):
    rng = np.random.default_rng(0)
    img = rng.integers(0, 256, size=(120, 160, 3), dtype=np.uint8)
    out = server.grade(img, style=style)
    assert out.dtype == np.uint8
    assert out.shape == img.shape
    assert out.min() >= 0 and out.max() <= 255


def test_grade_sober_is_not_darker_than_input_midtones():
    # The sober grade is explicitly "bright/airy, NOT darker" (handoff §5). A
    # mid-grey scene must not come out darker overall.
    img = solid((110, 110, 110), h=120, w=160)
    out = server.grade(img, style="sober")
    assert float(np.median(luminance(out))) >= 110


def test_grade_sober_reaches_bright_airy_level():
    # v3 retune (2026-07-01): v2 (target 0.50, gamma 0.90) still read dark/muddy
    # against the owner's AutoHDR side-by-side. A moderately dim scene (median
    # ~0.35, e.g. an under-lit interior before grading) must land meaningfully
    # bright and airy after grading — not just "not darker."
    img = solid((90, 90, 90), h=120, w=160)
    out = server.grade(img, style="sober")
    assert float(np.median(luminance(out))) >= 150
