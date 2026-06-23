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

import os
from typing import List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, Response, UploadFile

app = FastAPI()
SECRET = os.environ.get("EDIT_WORKER_SECRET", "")


def _decode(data: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="decode_failed")
    return img


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
    # White-patch WB on bright, near-neutral pixels (real-estate scenes have white
    # trim / ceilings / driveways that SHOULD be neutral). Gray-world balances the
    # whole-scene average, so a dominant colour — e.g. green lawns/foliage —
    # over-corrects into a pink/magenta cast. Anchoring to bright neutrals avoids
    # that. Gains are clamped + blended so we never shift wildly.
    try:
        small = cv2.resize(img, (256, 256), interpolation=cv2.INTER_AREA).astype(np.float32)
        b, g, r = small[..., 0], small[..., 1], small[..., 2]
        lum = 0.114 * b + 0.587 * g + 0.299 * r
        thresh = np.percentile(lum, 85)
        mask = (lum >= thresh) & (lum < 250)  # bright but not clipped
        if int(mask.sum()) < 50:
            return img
        rm = float(r[mask].mean())
        gm = float(g[mask].mean())
        bm = float(b[mask].mean())
        blend = 0.6

        def gain(c: float) -> float:
            if c <= 0:
                return 1.0
            return float(np.clip(1.0 + (gm / c - 1.0) * blend, 0.85, 1.18))

        rg, bg = gain(rm), gain(bm)
        out = img.astype(np.float32)
        out[..., 2] = np.clip(out[..., 2] * rg, 0, 255)  # R
        out[..., 0] = np.clip(out[..., 0] * bg, 0, 255)  # B
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


def tone_curve(
    img: np.ndarray,
    black_point: float = 1.0,
    contrast: float = 0.90,
    airy_gamma: float = 0.88,
) -> np.ndarray:
    # Luxury = bright & airy, low contrast. A hair of black point (just off muddy),
    # an actual DE-contrast (<1 compresses the tonal range = softer), plus a gentle
    # gamma lift opening the midtones so the property feels light and expensive.
    x = np.arange(256, dtype=np.float32)
    y = (x - black_point) * (255.0 / (255.0 - black_point))  # light black point
    y = (y - 128.0) * contrast + 128.0  # contrast (1.0 = none)
    y = np.clip(y, 0, 255)
    y = 255.0 * np.power(y / 255.0, airy_gamma)  # airy midtone lift (<1 brightens)
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


def grade(img: np.ndarray) -> np.ndarray:
    img = correct_lens(img)  # geometric correction first, before tone/colour
    img = auto_white_balance(img)
    img = denoise(img)
    # (local_contrast/CLAHE intentionally omitted — it was adding the gritty
    #  micro-contrast that read as too contrasty; the soft de-contrast curve gives
    #  the airy luxury look instead.)
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
    return {"ok": True, "service": "oceano-edit-engine"}


@app.post("/edit")
async def edit(
    files: List[UploadFile] = File(...),
    mode: str = Form("grade"),
    target_long_edge: int = Form(4000),
    quality: int = Form(90),
    x_edit_secret: Optional[str] = Header(None),
):
    if not SECRET or x_edit_secret != SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")
    if not files:
        raise HTTPException(status_code=400, detail="no_files")

    images = [_decode(await f.read()) for f in files]

    if mode == "fuse":
        out = fuse(images)
    elif mode == "grade":
        out = grade(images[0])
    else:
        raise HTTPException(status_code=400, detail="bad_mode")

    out = resize_long_edge(out, target_long_edge)
    ok, buf = cv2.imencode(".jpg", out, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    if not ok:
        raise HTTPException(status_code=500, detail="encode_failed")
    return Response(content=buf.tobytes(), media_type="image/jpeg")
