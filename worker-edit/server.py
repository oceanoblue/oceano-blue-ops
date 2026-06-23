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
    # Mertens: contrast + saturation weights, exposure weight 0 (we grade later).
    merge = cv2.createMergeMertens(1.0, 1.0, 0.0)
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
    # Very gentle CLAHE on L only — a touch of depth without the "HDR" punch.
    # Low clip + large tiles keep it soft (luxury reads as restraint, not grit).
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=1.2, tileGridSize=(16, 16)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def tone_curve(img: np.ndarray, black_point: float = 4.0, contrast: float = 1.04) -> np.ndarray:
    # Anchor a true black point (kills the washed/hazy look) + gentle contrast.
    x = np.arange(256, dtype=np.float32)
    y = (x - black_point) * (255.0 / (255.0 - black_point))  # set black point
    y = (y - 128.0) * contrast + 128.0  # gentle S around mid-grey
    lut = np.clip(y, 0, 255).astype(np.uint8)
    return cv2.LUT(img, lut)


def saturate(img: np.ndarray, scale: float = 1.06) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * scale, 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def sharpen(img: np.ndarray, amount: float = 0.4) -> np.ndarray:
    # Edge-aware unsharp: blur the base, add back the high-frequency difference.
    blur = cv2.GaussianBlur(img, (0, 0), 1.2)
    return cv2.addWeighted(img, 1.0 + amount, blur, -amount, 0)


def grade(img: np.ndarray) -> np.ndarray:
    img = auto_white_balance(img)
    img = denoise(img)
    img = local_contrast(img)
    img = tone_curve(img)
    img = saturate(img)
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
