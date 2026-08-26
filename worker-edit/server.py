"""
Oceano Edit Engine — deterministic real-estate photo pipeline.

Faithful by design: it only adjusts the real pixels (exposure fusion, white
balance, local contrast, tone, sharpening). It never synthesizes/hallucinates
content. Generative edits (sky, declutter, staging) live elsewhere as masked,
opt-in operations.

Two operations (form field `mode`):
  - fuse  : Mertens multi-scale exposure fusion of a bracket (2/3/5/7 frames)
            into one well-exposed image. NO grade — this is the merged base.
  - grade : the faithful finishing grade (auto WB, denoise, local contrast,
            tone/black-point, gentle saturation, edge-aware sharpen). Run on a
            single frame or on a fused base.

Why this exists: a naive single-scale average of brackets collapses local
contrast (flat/washed). Mertens blends per-frequency-band via Laplacian
pyramids, preserving local contrast and avoiding halos. (Mertens, Kautz,
Van Reeth 2007.)
"""

import io
import math
import os
from typing import List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, Response, UploadFile

from window_pull import window_pull as pull_windows, pick_darkest
from geometry import straighten_verticals
from sky import replace_sky

try:
    import rawpy  # libraw-backed full RAW decode
    _HAS_RAWPY = True
except Exception:  # pragma: no cover - import guard
    _HAS_RAWPY = False

app = FastAPI()
SECRET = os.environ.get("EDIT_WORKER_SECRET", "")


def _decode_raw(data: bytes) -> Optional[np.ndarray]:
    """Full RAW decode via libraw: real demosaic + camera white balance, so the
    merge/grade works on the sensor's actual data (and its highlight/shadow
    headroom) instead of the small baked-in JPEG preview. Returns BGR uint8, or
    None if the bytes aren't a RAW this build can read."""
    if not _HAS_RAWPY:
        return None
    try:
        with rawpy.imread(io.BytesIO(data)) as raw:
            rgb = raw.postprocess(
                use_camera_wb=True,      # honor the camera's WB, not a guess
                no_auto_bright=False,    # sane baseline exposure; grade refines it
                output_bps=8,            # matches the uint8 BGR grade pipeline
                gamma=(2.222, 4.5),      # standard display gamma
            )
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception:
        return None


def _decode(data: bytes) -> np.ndarray:
    # Browser-decodable formats first (fast path), then full RAW via libraw.
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is not None:
        return img
    raw = _decode_raw(data)
    if raw is not None:
        return raw
    raise HTTPException(status_code=400, detail="decode_failed")


def _match_sizes(images: List[np.ndarray]) -> List[np.ndarray]:
    h, w = images[0].shape[:2]
    out = []
    for im in images:
        if im.shape[:2] != (h, w):
            im = cv2.resize(im, (w, h), interpolation=cv2.INTER_AREA)
        out.append(im)
    return out


# ── Exposure fusion ────────────────────────────────────────────────────────
def _fuse_finalize(res: np.ndarray) -> np.ndarray:
    # Mertens reconstructs from Laplacian pyramids, so the float result can
    # overshoot [0, 1] at high-contrast edges — exactly the window/frame pixels
    # we care about. A hard clip flattens that overshoot to 255 and the
    # separation is gone before the grade ever runs (v6 finding: this was the
    # FIRST of three places the pipeline threw highlight detail away). When the
    # result runs hot, renormalize by the 99.9th percentile (robust to a few
    # specular outliers) so the whole range lands inside 8 bits with its
    # separation intact.
    hi = float(np.percentile(res, 99.9))
    if hi > 1.0:
        res = res / hi
    return np.clip(res * 255.0, 0, 255).astype(np.uint8)


def fuse(images: List[np.ndarray]) -> np.ndarray:
    if len(images) == 1:
        return images[0]
    images = _match_sizes(images)
    # Best-effort alignment for hand-held brackets; a no-op for tripod shots.
    try:
        aligned: List[np.ndarray] = []
        cv2.createAlignMTB().process(images, aligned)
        if aligned and len(aligned) == len(images):
            images = aligned
    except Exception:
        pass
    # Mertens weights (contrast, saturation, well-exposedness). Favor
    # well-exposedness for an even, natural, magazine-soft base; keep contrast and
    # saturation low so the fusion doesn't bake in a vivid/"HDR" punch (that punch
    # was the main thing reading as not-luxury). The grade adds the airy finish.
    merge = cv2.createMergeMertens(0.15, 0.25, 1.0)
    res = merge.process(images)  # float32, nominally [0, 1] but can overshoot
    return _fuse_finalize(res)


# ── Faithful finishing grade ───────────────────────────────────────────────
def auto_white_balance(img: np.ndarray) -> np.ndarray:
    # White-patch WB anchored on bright pixels that are ALSO genuinely neutral
    # (low chroma). Real-estate scenes have white trim / ceilings / clouds /
    # driveways that SHOULD be neutral — those are our reference.
    #
    # Why the neutral filter matters: a plain "brightest pixels" white-patch gets
    # dragged by the sky. On exteriors the brightest pixels are usually BLUE sky;
    # neutralising blue means removing blue + adding red, so the whole image
    # drifts WARM (and whites stop being white). Excluding chromatic pixels (sky,
    # coloured walls, foliage) leaves only true neutrals, so we can correct nearly
    # fully (blend 0.9) and land whites actually neutral without a warm cast.
    try:
        small = cv2.resize(img, (256, 256), interpolation=cv2.INTER_AREA).astype(np.float32)
        b, g, r = small[..., 0], small[..., 1], small[..., 2]
        lum = 0.114 * b + 0.587 * g + 0.299 * r
        maxc = np.maximum(np.maximum(r, g), b)
        minc = np.minimum(np.minimum(r, g), b)
        chroma = (maxc - minc) / (maxc + 1e-6)  # 0 = perfectly grey
        # Blue-dominance: positive when blue is the strongest channel (sky / cool
        # surfaces). We must exclude sky from the reference even when it's pale,
        # so we test blueness directly rather than relying on chroma alone.
        blueness = (b - np.maximum(r, g)) / (maxc + 1e-6)

        bright = lum >= np.percentile(lum, 80)
        unclipped = lum < 250
        # Keep should-be-white surfaces that carry a cast (chroma up to ~0.35 lets
        # a warm/cool white still count as the reference) but drop saturated
        # colour (foliage, painted walls) and anything blue-dominant (sky).
        neutral = (chroma < 0.35) & (blueness < 0.08)
        mask = bright & unclipped & neutral
        if int(mask.sum()) < 50:
            # No clear neutral patch (e.g. heavily coloured scene) — fall back to
            # bright-only with a gentler blend so we don't introduce a cast.
            mask = bright & unclipped
            if int(mask.sum()) < 50:
                return img
            blend = 0.5
        else:
            blend = 0.9  # confident neutral reference → correct nearly fully

        rm = float(r[mask].mean())
        gm = float(g[mask].mean())
        bm = float(b[mask].mean())

        # Anchor ALL THREE channels to the neutral patch's own grey (the mean of
        # the three). Correcting toward that target — not toward green — fixes the
        # green/magenta TINT as well as warm/cool. (The old code scaled only R and
        # B toward G, so a genuine green cast was uncorrectable.)
        target = (rm + gm + bm) / 3.0

        def gain(c: float) -> float:
            if c <= 0:
                return 1.0
            return float(np.clip(1.0 + (target / c - 1.0) * blend, 0.80, 1.25))

        rg, gg, bg = gain(rm), gain(gm), gain(bm)
        if img.dtype == np.uint8:
            out = img.astype(np.float32)
            out[..., 2] = np.clip(out[..., 2] * rg, 0, 255)  # R
            out[..., 1] = np.clip(out[..., 1] * gg, 0, 255)  # G (tint)
            out[..., 0] = np.clip(out[..., 0] * bg, 0, 255)  # B
            return out.astype(np.uint8)
        # Float path (the grade's v6 core): apply the gains WITHOUT clipping —
        # a corrected near-white may briefly exceed 255 and the tone curve's
        # shoulder recovers it. Clipping here was one of the serial hard clips
        # that made "brighter" and "windows hold" fight over the same 8 bits.
        img = img.copy()
        img[..., 2] *= rg
        img[..., 1] *= gg
        img[..., 0] *= bg
        return img
    except Exception:
        return img


def auto_exposure(
    img: np.ndarray,
    target: float = 0.50,
    highlight_ceiling: Optional[float] = None,
    highlight_percentile: float = 97.0,
) -> np.ndarray:
    # Normalise overall brightness to a target so a dark/bright merge lands at a
    # consistent, properly-exposed level (the grade's black-point/gamma only SHAPE
    # tone — they don't set the overall level). Exposes for the ROOM via the MEDIAN
    # luminance (robust to bright-window outliers); the tone curve's highlight
    # roll-off then softens whatever the windows do.
    #
    # v4 fix: the gain is bounded so the frame's OWN bright end (the
    # `highlight_percentile`, robust to a few blown specular pixels) doesn't
    # cross `highlight_ceiling` — a dark room can't force a gain that blows an
    # already-recovered window (window-pull) flat before the shoulder sees it.
    #
    # v6: in the float pipeline the ceiling sits ABOVE white (default 1.05) —
    # over-range survives (nothing clips here) and the tone curve's shoulder
    # compresses it back under 255 with its separation intact. That's the
    # mechanism that finally decouples "expose the room properly" from "hold
    # the windows": the v2↔v3 ping-pong existed because uint8 forced one knob
    # to do both. On uint8 input (back-compat path) over-range would be
    # destroyed by the clip below, so the ceiling stays at 0.94.
    # Multiplicative either way, so colour ratios are preserved.
    try:
        is_float = img.dtype != np.uint8
        if highlight_ceiling is None:
            highlight_ceiling = 1.05 if is_float else 0.94
        small = cv2.resize(img, (256, 256), interpolation=cv2.INTER_AREA).astype(np.float32)
        b, g, r = small[..., 0], small[..., 1], small[..., 2]
        lum = 0.114 * b + 0.587 * g + 0.299 * r
        med = float(np.median(lum)) / 255.0
        if med <= 0.001:
            return img
        # Cap lift at 1.8× (don't manufacture a scene out of near-black) and allow
        # mild darkening for over-bright merges.
        gain = float(np.clip(target / med, 0.6, 1.8))
        hi = float(np.percentile(lum, highlight_percentile)) / 255.0
        if hi > 0.001:
            highlight_safe_gain = highlight_ceiling / hi
            gain = min(gain, max(highlight_safe_gain, 0.6))
        if is_float:
            return img * np.float32(gain)  # unclipped — shoulder handles over-range
        out = img.astype(np.float32) * gain
        return np.clip(out, 0, 255).astype(np.uint8)
    except Exception:
        return img


_LUM_BGR = np.array([[0.114, 0.587, 0.299]], dtype=np.float32)


def _luminance_f32(img: np.ndarray) -> np.ndarray:
    # cv2.transform is a single SIMD pass (vs three numpy casts + weighted sum),
    # which matters at native resolution where these are pure memory-bandwidth ops.
    return cv2.transform(img.astype(np.float32, copy=False), _LUM_BGR).reshape(img.shape[:2])


def shadow_lift(
    img: np.ndarray,
    amount: float = 0.40,
    radius_frac: float = 0.20,
    eps: float = 1500.0,
    work_edge: int = 384,
) -> np.ndarray:
    # ROOM-SCALE dynamic-range compression — the "flambient" look the AutoHDR
    # side-by-side showed we're missing: our output reads a stop-plus darker in
    # the foreground than the window wall, the reference reads nearly flat.
    # Splits luminance into a room-scale BASE ("this corner is shadowed, that
    # wall is lit") and a DETAIL layer (texture/grain, untouched), compresses
    # only the base toward its own mean — a uniformly-lit frame is a true no-op.
    #
    # v6 rebuild, two fixes over the v5 Gaussian version:
    #  - EDGE-AWARE base (self-guided filter): a Gaussian smears window
    #    brightness across the window/wall boundary, so compression painted a
    #    glow band onto the dark side — the exact halo artifact that makes
    #    photos read "HDR-pushed". The guided filter keeps strong edges (local
    #    variance >> eps) in the base, so the compression steps AT the edge
    #    instead of across it. Texture (variance < eps) stays in detail.
    #  - PROXY-SCALE compute: v5 ran a sigma≈0.25·min(h,w) Gaussian at native
    #    resolution — a ~10,000-px kernel on a 40MP frame, minutes of CPU. The
    #    base coefficients are computed on a ≤`work_edge` proxy and upsampled;
    #    for a room-scale base the result is visually identical and ~100× faster.
    #
    # Applied as a multiplicative luminance gain, so hue/chroma ratios are
    # preserved. Accepts uint8 or float32; float in → float out (no clip).
    try:
        is_float = img.dtype != np.uint8
        l = _luminance_f32(img)
        h, w = l.shape[:2]
        scale = work_edge / max(h, w)
        if scale < 1.0:
            small = cv2.resize(l, (max(2, round(w * scale)), max(2, round(h * scale))), interpolation=cv2.INTER_AREA)
        else:
            small = l
        r_box = max(4, int(min(small.shape[:2]) * radius_frac))
        k = (2 * r_box + 1, 2 * r_box + 1)
        mean = cv2.blur(small, k)
        var = cv2.blur(small * small, k) - mean * mean
        a = var / (var + eps)                # →1 at strong edges (kept in base)
        b_coef = (1.0 - a) * mean            # →mean in flat/textured regions
        a = cv2.blur(a, k)                   # canonical guided-filter smoothing
        b_coef = cv2.blur(b_coef, k)         # of the coefficient maps
        # Full-res section below is pure memory bandwidth at native resolution —
        # keep it to in-place passes on two single-channel buffers (base, l).
        base = cv2.resize(a, (w, h), interpolation=cv2.INTER_LINEAR)
        base *= l
        base += cv2.resize(b_coef, (w, h), interpolation=cv2.INTER_LINEAR)
        m = float(base.mean())
        # gain = clip((l - amount·(base − m)) / max(l, ε), 0.5, 2.5), in place:
        base -= m
        base *= -amount
        base += l                            # base is now new_l
        np.maximum(l, 1e-3, out=l)
        base /= l                            # base is now the raw gain
        np.clip(base, 0.5, 2.5, out=base)
        out = img.astype(np.float32)
        out *= base[..., None]
        if is_float:
            return out
        np.clip(out, 0, 255, out=out)
        return out.astype(np.uint8)
    except Exception:
        return img


def denoise(img: np.ndarray) -> np.ndarray:
    # Light, fast, edge-preserving. Done BEFORE local contrast/sharpen so we
    # never amplify noise into grain.
    return cv2.bilateralFilter(img, d=5, sigmaColor=35, sigmaSpace=5)


def local_contrast(img: np.ndarray) -> np.ndarray:
    # Whisper of CLAHE on L only — just enough to avoid total flatness. Kept very
    # low because local contrast on textured surfaces (the building/foreground) is
    # what made the property read gritty/heavy instead of airy luxury.
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=1.0, tileGridSize=(16, 16)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def _shoulder(t: np.ndarray, knee: float = 0.80, rolloff: float = 0.35) -> np.ndarray:
    # Rational highlight shoulder with real OVER-RANGE headroom. Input t is
    # normalized luminance (1.0 = white) and may exceed 1.0 in the float
    # pipeline (exposure/WB run unclipped there). Everything above the knee is
    # compressed smoothly so that t = H (the headroom limit) lands exactly at
    # 1.0 — over-range values come back UNDER white with their separation
    # intact, instead of clipping to a flat 255. g(u) = u / (1 + c·u) is
    # monotonic, C1 at the knee (unit slope), and hits 1 at the headroom limit.
    # This is the "expose the room, recover the windows in the shoulder"
    # mechanism; the modest H keeps in-range whites near-white (255-in maps to
    # ~241, not a dingy grey).
    H = 1.0 + 0.18 * rolloff
    U = (H - knee) / (1.0 - knee)
    c = (U - 1.0) / U
    u = np.maximum(t - knee, 0.0) / (1.0 - knee)
    g = u / (1.0 + c * u)
    return np.where(t > knee, knee + (1.0 - knee) * g, t)


def _tone_map(
    x: np.ndarray,
    black_point: float,
    contrast: float,
    airy_gamma: float,
    highlight_rolloff: float,
) -> np.ndarray:
    # The curve itself, in float (x in 0..255-and-above). Luxury = bright &
    # airy, low contrast: a hair of black point (just off muddy), an actual
    # DE-contrast (<1 = softer), a gentle gamma lift opening the midtones, and
    # (when rolloff > 0) the over-range-aware shoulder above.
    y = (x - black_point) * (255.0 / (255.0 - black_point))
    y = (y - 128.0) * contrast + 128.0
    y = np.maximum(y, 0.0)
    y /= 255.0
    # cv2.pow is a SIMD pass; np.power is scalar transcendental per element —
    # a real difference on a native-resolution frame.
    t = cv2.pow(y, airy_gamma) if y.ndim >= 2 else np.power(y, airy_gamma)
    if highlight_rolloff > 0:
        t = _shoulder(t, rolloff=highlight_rolloff)
    return t * 255.0


def tone_curve(
    img: np.ndarray,
    black_point: float = 1.0,
    contrast: float = 0.90,
    airy_gamma: float = 0.88,
    highlight_rolloff: float = 0.0,
) -> np.ndarray:
    # uint8 → applied as a LUT (identical math, sampled at the 256 levels).
    # float32 (the v6 grade core) → over-range preserved through the shoulder,
    # no clip (the grade quantizes exactly once, at the end). Applied via a
    # dense 65k-entry table of the exact curve — a gather instead of several
    # full-res transcendental passes (~5× faster at native resolution), with
    # quantization ≤ 0.005 luminance levels (invisible).
    if img.dtype == np.uint8:
        x = np.arange(256, dtype=np.float32)
        y = _tone_map(x, black_point, contrast, airy_gamma, highlight_rolloff)
        lut = np.clip(np.round(y), 0, 255).astype(np.uint8)
        return cv2.LUT(img, lut)
    max_in = 320.0  # covers the exposure/WB over-range headroom with margin
    n = 65536
    xs = np.linspace(0.0, max_in, n, dtype=np.float32)
    table = _tone_map(xs, black_point, contrast, airy_gamma, highlight_rolloff)
    # Clamp BEFORE the uint16 cast: a stray specular above the 97th-percentile
    # ceiling (which only bounds the percentile, not the max) would otherwise
    # wrap the cast and index garbage.
    idx = np.clip(img * np.float32((n - 1) / max_in), 0, n - 1).astype(np.uint16)
    return table[idx]


def saturate(img: np.ndarray, scale: float = 1.0) -> np.ndarray:
    # Luminance-mix saturation: out = lum + (img − lum)·scale. Equivalent to a
    # gentle chroma scale for the small factors we use, works natively in float
    # (v6: no more uint8 HSV round-trip, which quantized and could micro-shift
    # hue), and scale = 0 is exact greyscale.
    is_float = img.dtype != np.uint8
    lum = _luminance_f32(img)[..., None]
    out = lum + (img.astype(np.float32) - lum) * np.float32(scale)
    if is_float:
        return out
    return np.clip(out, 0, 255).astype(np.uint8)


def sharpen(img: np.ndarray, amount: float = 0.25) -> np.ndarray:
    # Edge-aware unsharp: blur the base, add back the high-frequency difference.
    blur = cv2.GaussianBlur(img, (0, 0), 1.2)
    return cv2.addWeighted(img, 1.0 + amount, blur, -amount, 0)


# Barrel-distortion correction strength. Negative = remove barrel (the outward
# bowing of a wide 16mm lens, straightening edges/walls). Tunable; env override.
LENS_K1 = float(os.environ.get("LENS_K1", "-0.16"))


# Auto-level: correct small camera tilt so walls/verticals sit straight. This is
# a precise ROTATION (never a perspective guess) derived from the dominant
# near-vertical / near-horizontal lines — so it can't invent geometry. Runs on
# the composed frame before delivery/generative finish. Env: STRAIGHTEN=0 to
# disable, STRAIGHTEN_MAX_DEG to bound the correction.
STRAIGHTEN = os.environ.get("STRAIGHTEN", "1") != "0"
STRAIGHTEN_MAX_DEG = float(os.environ.get("STRAIGHTEN_MAX_DEG", "6.0"))


def _detect_tilt(img: np.ndarray, max_deg: float) -> float:
    try:
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        w0 = 1024
        g = cv2.resize(g, (w0, max(1, int(w0 * g.shape[0] / g.shape[1]))), interpolation=cv2.INTER_AREA)
        edges = cv2.Canny(g, 60, 180)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=90,
                                minLineLength=g.shape[0] // 4, maxLineGap=20)
        if lines is None:
            return 0.0
        devs = []
        for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
            ang = math.degrees(math.atan2(float(y2 - y1), float(x2 - x1)))
            for ref in (0.0, 90.0, -90.0, 180.0, -180.0):
                d = ang - ref
                if abs(d) <= max_deg:
                    devs.append(d)
                    break
        if len(devs) < 8:
            return 0.0
        return float(np.median(devs))
    except Exception:
        return 0.0


def straighten(img: np.ndarray) -> np.ndarray:
    if not STRAIGHTEN:
        return img
    tilt = _detect_tilt(img, STRAIGHTEN_MAX_DEG)
    if abs(tilt) < 0.15:  # already level — skip the resample + crop
        return img
    try:
        h, w = img.shape[:2]
        M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), tilt, 1.0)
        rot = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        a = math.radians(abs(tilt))
        cw = int(w - h * math.sin(a) - w * (1 - math.cos(a)))
        ch = int(h - w * math.sin(a) - h * (1 - math.cos(a)))
        if cw < w * 0.6 or ch < h * 0.6:  # implausible crop → skip
            return img
        x0, y0 = (w - cw) // 2, (h - ch) // 2
        return rot[y0:y0 + ch, x0:x0 + cw]
    except Exception:
        return img


def correct_lens(img: np.ndarray, k1: float = None) -> np.ndarray:
    # Parametric radial-distortion correction. Tuned for a ~16mm full-frame wide
    # lens; precise per-lens (lensfun) correction can replace this later. alpha=0
    # zooms to the valid region so there are no black corners after the warp.
    k1 = LENS_K1 if k1 is None else k1
    if abs(k1) < 0.001:
        return img
    try:
        h, w = img.shape[:2]
        f = float(max(w, h))
        K = np.array([[f, 0, w / 2.0], [0, f, h / 2.0], [0, 0, 1.0]], dtype=np.float64)
        dist = np.array([k1, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
        new_k, _ = cv2.getOptimalNewCameraMatrix(K, dist, (w, h), 0.0, (w, h))
        return cv2.undistort(img, K, dist, None, new_k)
    except Exception:
        return img


def soften_sky(img: np.ndarray, sat_scale: float = 0.88, lift: float = 12.0) -> np.ndarray:
    # Lighten + gently desaturate blue-sky pixels toward the airy, light-blue look
    # (deep/dark blue reads less luxury). Targets only blue hues, so greens and
    # neutrals are untouched.
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    h = hsv[..., 0]  # OpenCV hue 0..179; sky blue ~ 98..132
    mask = (h >= 98) & (h <= 132)
    hsv[..., 1] = np.where(mask, hsv[..., 1] * sat_scale, hsv[..., 1])
    hsv[..., 2] = np.where(mask, np.clip(hsv[..., 2] + lift, 0, 255), hsv[..., 2])
    return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)


def grade(img: np.ndarray, style: str = "default") -> np.ndarray:
    # v6 (2026-07-01, Fable rebuild): the grade now runs a FLOAT32 core with
    # exactly ONE quantization, at the end. The old pipeline clipped and
    # re-quantized at every stage, which is why "brighter" and "windows hold"
    # kept fighting (the v2↔v3 ping-pong): once any stage clipped a window to
    # 255, no later stage could recover it. In float, WB/exposure may push
    # near-whites over 255, and the tone curve's over-range shoulder brings
    # them back UNDER white with their separation intact.
    #
    # Order matters and is deliberate:
    #  - lens + denoise on uint8 FIRST: geometry has no precision to gain, and
    #    denoising the unamplified signal means later gains can't amplify noise
    #    that a later denoise would then have to chase.
    #  - shadow_lift BEFORE auto_exposure: compressing the room-scale range
    #    first RAISES the median and LOWERS the bright end, so the exposure
    #    push toward target needs less gain and its highlight ceiling binds
    #    later — compress-then-push is what actually brightens the room
    #    without re-blowing the windows.
    img = correct_lens(img)
    img = denoise(img)
    f = img.astype(np.float32)
    f = auto_white_balance(f)  # neutral whites + tint; unclipped in float
    if style == "sober":
        # Room-scale flambient compression (edge-aware, halo-free) — the gap a
        # real AutoHDR side-by-side showed after v4: foreground a stop-plus
        # darker than the window wall while the reference reads nearly flat.
        f = shadow_lift(f, amount=0.40)
    # sober targets brighter than default (0.55 vs 0.52) and gets the higher
    # float-headroom ceiling — it has the roll-off shoulder to recover
    # over-range; default has no shoulder so it keeps the conservative cap.
    f = auto_exposure(
        f,
        target=0.55 if style == "sober" else 0.52,
        highlight_ceiling=1.05 if style == "sober" else 0.94,
    )
    if style == "sober":
        # Architectural / interior / MLS / luxury (all profiles): BRIGHT, airy,
        # accurate. Gentle midtone lift (gamma 0.86), light black point, mild
        # de-contrast (0.94) for the soft editorial feel, and the over-range
        # shoulder holds window/exterior detail. Colour stays faithful.
        f = tone_curve(
            f, black_point=1.0, contrast=0.94, airy_gamma=0.86, highlight_rolloff=0.35
        )
        f = saturate(f, 0.98)
        f = sharpen(f)
        return np.clip(np.round(f), 0, 255).astype(np.uint8)  # THE quantization
    # 'default' (currently unselected by any profile — kept as a possible
    # punchier tier): airy curve, fuller saturation, sky soften.
    f = tone_curve(f)
    f = saturate(f)
    out = np.clip(np.round(f), 0, 255).astype(np.uint8)
    out = soften_sky(out)  # HSV masking wants uint8; near the end anyway
    return sharpen(out)


# ── Look transfer ──────────────────────────────────────────────────────────
def _fit_look_luts(orig: np.ndarray, ref: np.ndarray, samples: int = 256) -> np.ndarray:
    """Per-channel quantile mapping original → reference, as three monotone
    256-entry LUTs (shape (1, 256, 3), BGR, uint8). Fit on small proxies —
    global tone/colour statistics don't need resolution."""
    # NEAREST, deliberately: it SUBSAMPLES the pixel population, so the proxy's
    # histogram is an unbiased draw from the real one. AREA would average
    # neighbours and narrow the distribution, biasing the fitted tails.
    o = cv2.resize(orig, (256, 256), interpolation=cv2.INTER_NEAREST).astype(np.float32)
    r = cv2.resize(ref, (256, 256), interpolation=cv2.INTER_NEAREST).astype(np.float32)
    qs = np.linspace(0.0, 100.0, samples)
    x = np.arange(256, dtype=np.float32)
    luts = []
    for c in range(3):
        oq = np.percentile(o[..., c], qs)
        rq = np.percentile(r[..., c], qs)
        # Percentiles are nondecreasing; nudge strictly increasing for interp.
        oq = oq + np.linspace(0.0, 1e-3, samples)
        lut = np.interp(x, oq, rq)
        luts.append(np.clip(np.round(lut), 0, 255).astype(np.uint8))
    return np.stack(luts, axis=-1).reshape(1, 256, 3)


def apply_look(orig: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Transfer the GLOBAL grade (tone + colour) of `ref` onto `orig` at
    orig's full resolution.

    Why this exists: generative models (GPT Image) produce the look the owner
    wants, but top out around 3.5MP — pixelated next to a 24–61MP master. The
    fix: treat the generative render purely as a COLOUR/TONE REFERENCE and
    re-create its grade on the native original with a per-channel quantile
    mapping. The deliverable is then 100% real camera pixels — native
    resolution, no upscaling softness, and definitionally zero hallucinated
    content — wearing the reference's grade. Quantile mapping is monotone per
    channel, so tonal ordering can't invert; it's global, so a reference whose
    content the model locally redrew still transfers cleanly (its global
    statistics barely move)."""
    return cv2.LUT(orig, _fit_look_luts(orig, ref))


def resize_long_edge(img: np.ndarray, target: int) -> np.ndarray:
    if target <= 0:
        return img
    h, w = img.shape[:2]
    le = max(h, w)
    if le <= target:
        return img
    s = target / le
    return cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)


@app.get("/health")
def health():
    return {"ok": True, "service": "oceano-edit-engine", "raw": _HAS_RAWPY}


@app.post("/edit")
async def edit(
    files: List[UploadFile] = File(...),
    mode: str = Form("grade"),
    target_long_edge: int = Form(0),  # 0 = keep native resolution (no downscale)
    quality: int = Form(95),
    style: str = Form("default"),  # 'default' (real-estate) | 'sober' (architectural)
    # Opt-in enhancements (default OFF → behaviour unchanged for existing callers).
    # Enable per-profile from the app layer once validated on real renders.
    window_pull: bool = Form(False),    # fuse mode: recover blown windows from the darkest bracket
    straighten: bool = Form(False),     # de-skew + bounded keystone so verticals are plumb
    keystone: bool = Form(True),        # whether straighten also applies the keystone warp
    sky_mode: str = Form("keep"),       # 'keep' | 'replace' (replace is no-op for the 'sober' style)
    x_edit_secret: Optional[str] = Header(None),
):
    if not SECRET or x_edit_secret != SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")
    if not files:
        raise HTTPException(status_code=400, detail="no_files")

    if mode == "fuse":
        # CRITICAL: bound resolution BEFORE fusing, not after. Mertens holds float
        # Laplacian/Gaussian pyramids of EVERY bracket at once, so fusing at full
        # native RAW (30–60MP × 3–7 frames) OOMs the worker (502). Decode + shrink
        # one frame at a time so peak memory ≈ a single native decode + N bounded
        # frames. target_long_edge<=0 still means native (only safe with lots of RAM).
        imgs: List[np.ndarray] = []
        for f in files:
            im = _decode(await f.read())
            imgs.append(resize_long_edge(im, target_long_edge))
            del im
        out = fuse(imgs)
        # Window pull needs a darker frame to borrow the view from — fuse mode only.
        if window_pull and len(imgs) > 1:
            out = pull_windows(out, pick_darkest(imgs))
        del imgs
        if straighten:
            out = straighten_verticals(out, apply_keystone=keystone)
    elif mode == "grade":
        # Single frame — safe at native; grade then bound (no-op when target<=0).
        img = _decode(await files[0].read())
        if straighten:  # geometry before tone/colour
            img = straighten_verticals(img, apply_keystone=keystone)
        out = grade(img, style=style)
        if sky_mode == "replace":
            out = replace_sky(out, style=style)
    elif mode == "look":
        # files[0] = native original, files[1] = styled reference (e.g. a GPT
        # Image render). Output = the original's pixels wearing the reference's
        # global grade — native resolution, nothing synthesized.
        if len(files) < 2:
            raise HTTPException(status_code=400, detail="look_needs_two_files")
        orig = _decode(await files[0].read())
        ref = _decode(await files[1].read())
        out = apply_look(orig, ref)
    else:
        raise HTTPException(status_code=400, detail="bad_mode")

    out = straighten(out)  # level small camera tilt before delivery / generative finish
    out = resize_long_edge(out, target_long_edge)
    ok, buf = cv2.imencode(".jpg", out, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    if not ok:
        raise HTTPException(status_code=500, detail="encode_failed")
    return Response(content=buf.tobytes(), media_type="image/jpeg")
