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
        dict(black_point=1.0, contrast=0.94, airy_gamma=0.86, highlight_rolloff=0.35),  # sober (v4)
    ):
        lut = _lut(**kw)
        assert np.all(np.diff(lut) >= 0), f"tone curve must be monotonic for {kw}"


def test_tone_curve_white_stays_bright_and_topmost_with_rolloff():
    # The sober de-contrast (0.94) intentionally lands peak white just under 255
    # (~247) for an airy, un-clipped white — NOT a dingy grey. Invariant: the
    # brightest input is still the brightest output and stays near-white.
    lut = _lut(black_point=1.0, contrast=0.94, airy_gamma=0.86, highlight_rolloff=0.35)
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
    base = _lut(black_point=1.0, contrast=0.94, airy_gamma=0.86, highlight_rolloff=0.0)
    rolled = _lut(black_point=1.0, contrast=0.94, airy_gamma=0.86, highlight_rolloff=0.35)
    # Above the knee, the shoulder pulls values DOWN (holds window detail)…
    assert rolled[245] <= base[245]
    # …without collapsing them to a flat white: bright tones stay distinct.
    assert rolled[230] < rolled[252]


def test_tone_curve_float_recovers_over_range():
    # v6: the float pipeline lets WB/exposure push near-whites OVER 255 and the
    # shoulder must bring them back UNDER white with their separation intact —
    # the mechanism that decouples "expose the room" from "hold the windows".
    x = np.array([[[255.0] * 3, [265.0] * 3, [272.0] * 3]], np.float32)
    y = server.tone_curve(
        x, black_point=1.0, contrast=0.94, airy_gamma=0.86, highlight_rolloff=0.35
    )
    v = y[0, :, 0]
    assert v[0] < v[1] < v[2]  # over-range separation preserved
    assert v[2] <= 255.5       # everything lands back under white
    assert v[0] >= 236         # in-range white stays near-white, not dingy


def test_tone_curve_float_matches_lut_on_in_range_values():
    # The uint8 LUT and the float path are the SAME curve — sampled vs analytic.
    ramp_u8 = np.arange(256, dtype=np.uint8).reshape(1, 256, 1).repeat(3, axis=2)
    ramp_f = ramp_u8.astype(np.float32)
    kw = dict(black_point=1.0, contrast=0.94, airy_gamma=0.86, highlight_rolloff=0.35)
    lut_out = server.tone_curve(ramp_u8, **kw)[0, :, 0].astype(np.float32)
    f_out = server.tone_curve(ramp_f, **kw)[0, :, 0]
    assert np.abs(lut_out - f_out).max() <= 0.51  # only rounding apart


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
    # Near-black must not be manufactured into a scene: gain capped at 1.8×.
    dark = solid((10, 10, 10))
    assert float(np.median(luminance(server.auto_exposure(dark, target=0.50)))) <= 10 * 1.8 + 1
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


def test_auto_exposure_highlight_safe_protects_bright_regions():
    # v4 fix: a real render showed a dark room forcing a big gain that blew an
    # already-recovered window (window-pull) straight to flat white BEFORE the
    # tone curve's roll-off ever got a chance — a LUT can't un-clip 255. The
    # gain must now also respect the frame's own bright end (here, a "window"
    # strip that's ~9% of the frame, well above the 97th-percentile cutoff).
    img = np.full((64, 64, 3), 30, np.uint8)  # dark room
    img[:, 58:] = 210  # bright "window" strip
    out = server.auto_exposure(img, target=0.55)
    room_lum = float(luminance(out[:, :50]).mean())
    window_lum = float(luminance(out[:, 58:]).mean())
    assert room_lum > 30  # room still gets lifted...
    assert 195 <= window_lum <= 248  # ...but the window is held near the ceiling, not blown to 255


def test_auto_exposure_float_preserves_over_range():
    # v6: on float input nothing clips here — the ceiling sits above white
    # (1.05) and modest over-range flows through to the tone curve's shoulder.
    img = np.full((64, 64, 3), 60.0, np.float32)  # dim room
    img[:, 58:] = 240.0  # bright window strip
    out = server.auto_exposure(img, target=0.55)
    assert out.dtype == np.float32
    assert float(out[:, 58:].max()) > 255.0  # over-range PRESERVED, not clipped
    assert float(out[:, :50].mean()) > 60.0  # room still lifted


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


def test_fuse_finalize_preserves_overshoot_separation():
    # Mertens pyramid reconstruction can overshoot [0,1] at high-contrast edges
    # (window frames). v6: instead of hard-clipping both overshoot levels to a
    # flat 255, renormalize so they land inside 8 bits DISTINCT.
    res = np.full((8, 8, 3), 0.5, np.float32)
    res[0, 0] = 1.05
    res[0, 1] = 1.10
    out = server._fuse_finalize(res)
    assert int(out[0, 0, 0]) < int(out[0, 1, 0])  # separation kept
    assert int(out[0, 1, 0]) <= 255


def test_fuse_finalize_noop_when_in_range():
    res = np.full((8, 8, 3), 0.5, np.float32)
    out = server._fuse_finalize(res)
    assert int(out[0, 0, 0]) == 127  # 0.5 * 255, untouched (no renormalize)


def test_resize_long_edge_noop_and_downscale():
    img = solid((10, 20, 30), h=100, w=200)
    assert server.resize_long_edge(img, 0) is img           # 0 = keep native
    assert server.resize_long_edge(img, 500) is img         # never upscale
    out = server.resize_long_edge(img, 100)                 # downscale long edge → 100
    assert max(out.shape[:2]) == 100


# ── shadow_lift ────────────────────────────────────────────────────────────────
def test_shadow_lift_noop_on_uniform_image():
    # A uniformly-lit frame has nothing to compress: base == its own mean
    # everywhere, so this must be a true no-op (up to LAB round-trip rounding).
    img = solid((120, 120, 120), h=128, w=128)
    out = server.shadow_lift(img, amount=0.40)
    assert np.abs(out.astype(int) - img.astype(int)).max() <= 2


def test_shadow_lift_compresses_dynamic_range():
    # A dark "shadowed corner" beside a bright "window wall" — the real-world
    # case a room-scale gap between AutoHDR (near-flat) and our output (still a
    # stop-plus darker in the foreground) came from. Both large regions must
    # move toward the middle, narrowing the gap between them.
    img = np.zeros((128, 128, 3), np.uint8)
    img[:, :64] = 40    # dark half
    img[:, 64:] = 220   # bright half
    out = server.shadow_lift(img, amount=0.40)
    dark_before, bright_before = 40, 220
    dark_after = float(luminance(out[:, :30]).mean())   # sample away from the seam
    bright_after = float(luminance(out[:, 98:]).mean())
    assert dark_after > dark_before  # shadow lifted...
    assert bright_after < bright_before  # ...window wall pulled down...
    assert (bright_after - dark_after) < (bright_before - dark_before)  # ...gap narrows


def test_shadow_lift_preserves_fine_detail():
    # A fine stripe pattern (period tiny relative to the compression radius) on
    # an otherwise uniform frame lands almost entirely in the DETAIL layer, not
    # the compressed BASE — so its amplitude must survive, not get smoothed away
    # (this is the failure mode that made the old small-tile CLAHE read gritty
    # in the other direction; this must not read mushy in this one).
    img = np.full((128, 128, 3), 120, np.uint8)
    img[:, ::2] = 100  # alternating fine stripes
    img[:, 1::2] = 140
    out = server.shadow_lift(img, amount=0.40)
    amp_before = 140 - 100
    row = luminance(out[64:65, :])
    amp_after = float(row.max() - row.min())
    assert amp_after > amp_before * 0.6  # detail substantially preserved


def test_shadow_lift_edge_aware_no_halo():
    # v6: the v5 Gaussian base smeared window brightness across the window/wall
    # boundary, so compressing it painted a glow band onto the dark side — the
    # classic tone-mapping halo that reads "HDR-pushed". With the edge-aware
    # (guided-filter) base, the compression steps AT the boundary: dark-side
    # pixels near the seam must land at essentially the same level as dark-side
    # pixels far from it. (The v5 implementation fails this by ~30 levels.)
    img = np.zeros((128, 128, 3), np.uint8)
    img[:, :64] = 40   # dark wall
    img[:, 64:] = 220  # bright window
    out_l = luminance(server.shadow_lift(img, amount=0.40))
    dark_near = float(out_l[:, 48:60].mean())  # hugging the seam
    dark_far = float(out_l[:, 4:16].mean())
    assert abs(dark_near - dark_far) <= 12


def test_shadow_lift_float_roundtrip():
    # Float in → float out, unclipped, same compression behavior.
    img = np.zeros((128, 128, 3), np.float32)
    img[:, :64] = 40.0
    img[:, 64:] = 220.0
    out = server.shadow_lift(img, amount=0.40)
    assert out.dtype == np.float32
    gap_before = 220.0 - 40.0
    gap_after = float(out[:, 100:, 0].mean() - out[:, :30, 0].mean())
    assert gap_after < gap_before


# ── look transfer ─────────────────────────────────────────────────────────────
def test_look_identity_when_reference_matches():
    # Same image as its own reference → the mapping is ~identity.
    rng = np.random.default_rng(3)
    img = rng.integers(20, 236, size=(128, 128, 3), dtype=np.uint8)
    out = server.apply_look(img, img)
    assert np.abs(out.astype(int) - img.astype(int)).max() <= 2


def test_look_transfers_brightness_and_warmth_at_native_res():
    # The real use: a 3.5MP GPT render carries the wanted grade; the original is
    # native-res. Transfer must land the original's stats on the reference's —
    # at the ORIGINAL's resolution.
    rng = np.random.default_rng(4)
    orig = rng.integers(30, 200, size=(400, 600, 3), dtype=np.uint8)  # "native"
    ref = orig.astype(np.float32)
    ref[..., 2] = np.clip(ref[..., 2] * 1.25 + 10, 0, 255)  # warmer (R up)
    ref = np.clip(ref * 1.15, 0, 255).astype(np.uint8)      # brighter overall
    ref_small = ref[::4, ::4]  # low-res reference, like a GPT output
    out = server.apply_look(orig, ref_small)
    assert out.shape == orig.shape  # native resolution preserved
    assert abs(float(out.mean()) - float(ref.mean())) < 6  # grade level matched
    r_bias_out = float(out[..., 2].mean()) - float(out[..., 0].mean())
    r_bias_ref = float(ref[..., 2].mean()) - float(ref[..., 0].mean())
    assert abs(r_bias_out - r_bias_ref) < 8  # colour balance matched


def test_look_luts_are_monotone():
    # Quantile mapping must never invert tonal ordering (no solarization).
    rng = np.random.default_rng(5)
    orig = rng.integers(0, 256, size=(96, 96, 3), dtype=np.uint8)
    ref = np.clip(orig.astype(np.float32) * 0.7 + 40, 0, 255).astype(np.uint8)
    luts = server._fit_look_luts(orig, ref)
    assert luts.shape == (1, 256, 3)
    for c in range(3):
        assert np.all(np.diff(luts[0, :, c].astype(int)) >= 0)


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
    # v4 retune (2026-07-01): v2 (target 0.50, gamma 0.90) read dark/muddy against
    # the owner's AutoHDR side-by-side; v3 (target 0.58, gamma 0.82) overcorrected
    # on a real render (blown windows, blooming warm accents). v4 settles between
    # the two (target 0.55, gamma 0.86, plus the auto_exposure highlight-safety
    # fix). A moderately dim scene (median ~0.35, e.g. an under-lit interior
    # before grading) must still land meaningfully brighter than v2 (~136).
    img = solid((90, 90, 90), h=120, w=160)
    out = server.grade(img, style="sober")
    assert float(np.median(luminance(out))) >= 145


def test_grade_sober_holds_window_while_lifting_room():
    # The end-to-end v6 mechanism on a synthetic worst case: dim room + bright
    # window band. Compress (shadow_lift) → push (auto_exposure, float, ceiling
    # above white) → recover (shoulder). The room must come up meaningfully AND
    # the window must land under flat white, still brighter than the room —
    # the exact combination the uint8 pipeline could not do (v2↔v3 ping-pong).
    img = np.full((120, 160, 3), 60, np.uint8)  # dim room
    img[:, 130:] = 235                          # bright window band (~19%)
    out = server.grade(img, style="sober")
    room = float(np.median(luminance(out[:, :100])))
    window = float(np.median(luminance(out[:, 140:])))
    assert room >= 60 + 25   # room meaningfully lifted (a solid ~2/3 stop plus)
    assert window <= 254     # window NOT blown to flat white
    assert window > room     # tonal ordering preserved
