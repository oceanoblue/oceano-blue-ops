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
    res = merge.process(images)  # float32 in [0, 1]
    return np.clip(res * 255.0, 0, 255).astype(np.uint8)


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
        out = img.astype(np.float32)
        out[..., 2] = np.clip(out[..., 2] * rg, 0, 255)  # R
        out[..., 1] = np.clip(out[..., 1] * gg, 0, 255)  # G (tint)
        out[..., 0] = np.clip(out[..., 0] * bg, 0, 255)  # B
        return out.astype(np.uint8)
    except Exception:
        return img


def auto_exposure(
    img: np.ndarray,
    target: float = 0.50,
    highlight_ceiling: float = 0.94,
    highlight_percentile: float = 97.0,
) -> np.ndarray:
    # Normalise overall brightness to a target so a dark/bright merge lands at a
    # consistent, properly-exposed level (the grade's black-point/gamma only SHAPE
    # tone — they don't set the overall level). Exposes for the ROOM via the MEDIAN
    # luminance (robust to bright-window outliers); the tone curve's highlight
    # roll-off then softens whatever the windows do.
    #
    # v4 fix (2026-07-01): a real render exposed the flaw — this used to be a
    # flat multiply capped only by a fixed gain ceiling, so a dark room forced a
    # big gain that hard-clipped an already-recovered window (window-pull, P1)
    # straight to 255 BEFORE the tone curve's roll-off ever saw it (a LUT can't
    # un-clip a value that's already 255). Now the gain is also bounded so the
    # frame's OWN bright end (the `highlight_percentile`, robust to a handful of
    # blown specular pixels) doesn't cross `highlight_ceiling` — leaving the
    # tone curve's shoulder real headroom to do the final soft compression
    # instead of cleaning up an already-flat white. Multiplicative, so colour
    # ratios are preserved (no colour shift) either way.
    try:
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
        out = img.astype(np.float32) * gain
        return np.clip(out, 0, 255).astype(np.uint8)
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


def tone_curve(
    img: np.ndarray,
    black_point: float = 1.0,
    contrast: float = 0.90,
    airy_gamma: float = 0.88,
    highlight_rolloff: float = 0.0,
) -> np.ndarray:
    # Luxury = bright & airy, low contrast. A hair of black point (just off muddy),
    # an actual DE-contrast (<1 compresses the tonal range = softer), plus a gentle
    # gamma lift opening the midtones so the property feels light and expensive.
    x = np.arange(256, dtype=np.float32)
    y = (x - black_point) * (255.0 / (255.0 - black_point))  # light black point
    y = (y - 128.0) * contrast + 128.0  # contrast (1.0 = none)
    y = np.clip(y, 0, 255)
    y = 255.0 * np.power(y / 255.0, airy_gamma)  # airy midtone lift (<1 brightens)
    if highlight_rolloff > 0:
        # Soft highlight shoulder: gently compress the top end so bright areas
        # (windows, bright walls) hold tonal separation instead of clipping to a
        # flat white — the architectural/editorial "windows keep their view" look.
        # Monotonic ease-in above the knee; pure white (255) stays 255.
        t = y / 255.0
        knee = 0.80
        u = np.clip((t - knee) / (1.0 - knee), 0.0, 1.0)
        shoulder = (1.0 - highlight_rolloff) * u + highlight_rolloff * (u * u)
        t = np.where(t > knee, knee + (1.0 - knee) * shoulder, t)
        y = t * 255.0
    lut = np.clip(y, 0, 255).astype(np.uint8)
    return cv2.LUT(img, lut)


def saturate(img: np.ndarray, scale: float = 1.0) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * scale, 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def sharpen(img: np.ndarray, amount: float = 0.25) -> np.ndarray:
    # Edge-aware unsharp: blur the base, add back the high-frequency difference.
    blur = cv2.GaussianBlur(img, (0, 0), 1.2)
    return cv2.addWeighted(img, 1.0 + amount, blur, -amount, 0)


# Barrel-distortion correction strength. Negative = remove barrel (the outward
# bowing of a wide 16mm lens, straightening edges/walls). Tunable; env override.
LENS_K1 = float(os.environ.get("LENS_K1", "-0.16"))


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
    img = correct_lens(img)  # geometric correction first, before tone/colour
    img = auto_white_balance(img)  # neutral whites + tint correction
    # Proper exposure: normalise overall brightness BEFORE tone shaping so a dark
    # or bright merge lands at a consistent, well-exposed level. sober targets
    # higher than default (0.55 vs 0.52) since it has a highlight roll-off (and,
    # as of v4, a highlight-aware exposure cap) to hold windows; default has
    # neither, so its lower target stays the safety margin.
    #
    # v4 retune (2026-07-01): v3's 0.58 target, combined with the OLD flat gain
    # cap, blew out windows and bloomed the warm accent lighting on a real
    # render — dialed back partway, and paired with the auto_exposure
    # highlight-safety fix above so brightness and highlight-holding aren't
    # fighting the same knob.
    img = auto_exposure(img, target=0.55 if style == "sober" else 0.52)
    img = denoise(img)
    # (local_contrast/CLAHE intentionally omitted — it was adding the gritty
    #  micro-contrast that read as too contrasty.)
    if style == "sober":
        # Architectural / interior design: BRIGHT, airy, and accurate — the
        # reference look is luminous, not dark/documentary. "Not HDR-pushed" means
        # no gritty local-contrast/halos, NOT darker. So: a gentle midtone+shadow
        # lift (gamma 0.86) opens the room, a light black point (1.0) keeps shadows
        # from muddying, a touch of de-contrast (0.94) gives the soft editorial
        # feel, and the highlight roll-off holds window/exterior detail. Colour
        # stays faithful (no sky stylisation). v4 retune (2026-07-01): v3 (gamma
        # 0.82) pushed too hard on a real render — dialed the midtone lift back
        # partway (paired with the auto_exposure highlight-safety fix, so windows
        # hold without needing as much gamma push to make the room feel airy).
        img = tone_curve(
            img, black_point=1.0, contrast=0.94, airy_gamma=0.86, highlight_rolloff=0.35
        )
        img = saturate(img, 0.98)
        img = sharpen(img)
    else:
        # Real-estate (MLS / luxury): bright, airy, low-contrast luxury finish.
        img = tone_curve(img)
        img = saturate(img)
        img = soften_sky(img)
        img = sharpen(img)
    return img


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
    else:
        raise HTTPException(status_code=400, detail="bad_mode")

    out = resize_long_edge(out, target_long_edge)
    ok, buf = cv2.imencode(".jpg", out, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    if not ok:
        raise HTTPException(status_code=500, detail="encode_failed")
    return Response(content=buf.tobytes(), media_type="image/jpeg")
