"""
Window / sky segmentation for the edit engine.

PLUGGABLE BY DESIGN. The commercial tools (AutoHDR, Imagen, Autoenhance) drive
their window-pull and sky work from a learned semantic-segmentation model — "a
custom neural network trained on a vast dataset of real-estate images". That
model can be dropped in here later via an ONNX file (WINDOW_SEG_MODEL /
SKY_SEG_MODEL); callers don't change. Until one is provisioned we use a fast,
conservative CLASSICAL segmenter:

  - windows: the brightest, low-texture regions (blown glass / the exterior view)
    that form a sizeable connected area — not tiny specular highlights.
  - sky:     blue-or-blown, low-texture pixels anchored to the top edge.

Masks are SOFT (float32 in [0,1], feathered) so downstream blends are seamless.
The pure cores are unit-tested in test_masks.py; OpenCV morphology is used only
to clean/feather, so behaviour stays deterministic.
"""
import os
import cv2
import numpy as np


def luminance(img: np.ndarray) -> np.ndarray:
    """Rec.601 luma of a BGR uint8 image → float32 [0,255]."""
    b, g, r = img[..., 0].astype(np.float32), img[..., 1].astype(np.float32), img[..., 2].astype(np.float32)
    return 0.114 * b + 0.587 * g + 0.299 * r


def local_std(gray: np.ndarray, k: int = 7) -> np.ndarray:
    """Per-pixel local standard deviation (texture). Low std = flat (glass/sky)."""
    g = gray.astype(np.float32)
    mean = cv2.boxFilter(g, -1, (k, k), normalize=True)
    sq = cv2.boxFilter(g * g, -1, (k, k), normalize=True)
    var = np.clip(sq - mean * mean, 0, None)
    return np.sqrt(var)


def soft_from_binary(binary: np.ndarray, feather: int = 9, min_area_frac: float = 0.0) -> np.ndarray:
    """Clean a 0/1 mask (drop specks, optionally tiny components) and feather it
    into a float32 [0,1] mask. Pure morphology — deterministic."""
    m = (binary > 0).astype(np.uint8)
    if m.sum() == 0:
        return np.zeros(m.shape, np.float32)
    # Remove specks, then close small gaps.
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))

    if min_area_frac > 0:
        total = m.shape[0] * m.shape[1]
        n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
        keep = np.zeros_like(m)
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] >= min_area_frac * total:
                keep[labels == i] = 1
        m = keep

    if m.sum() == 0:
        return np.zeros(m.shape, np.float32)
    f = feather if feather % 2 == 1 else feather + 1
    soft = cv2.GaussianBlur(m.astype(np.float32), (f, f), 0)
    mx = float(soft.max())
    return soft / mx if mx > 0 else soft


def window_mask(
    img: np.ndarray,
    *,
    bright_pct: float = 90.0,
    bright_floor: float = 225.0,
    texture_max: float = 14.0,
    min_area_frac: float = 0.004,
    feather: int = 11,
) -> np.ndarray:
    """Soft mask of likely window/glass regions: bright AND flat AND part of a
    sizeable region. Conservative — a sizeable connected-area requirement keeps
    specular pin-highlights and small white objects out."""
    if os.environ.get("WINDOW_SEG_MODEL"):
        # Seam: a learned segmenter would run here. Not provisioned yet.
        pass
    gray = luminance(img)
    small = cv2.resize(gray, (256, 256), interpolation=cv2.INTER_AREA)
    thr = max(bright_floor, float(np.percentile(small, bright_pct)))
    bright = gray >= thr
    flat = local_std(gray, 7) <= texture_max
    candidate = (bright & flat).astype(np.uint8)
    mask = soft_from_binary(candidate, feather=feather, min_area_frac=min_area_frac)
    return mask


def sky_mask(
    img: np.ndarray,
    *,
    top_frac: float = 0.6,
    texture_max: float = 10.0,
    min_area_frac: float = 0.01,
    feather: int = 15,
) -> np.ndarray:
    """Soft mask of sky: blue-dominant OR blown-bright, flat, in the upper region
    and connected to the top edge (so a white wall lower down isn't 'sky')."""
    if os.environ.get("SKY_SEG_MODEL"):
        pass  # learned-segmenter seam
    h, w = img.shape[:2]
    b, g, r = img[..., 0].astype(np.float32), img[..., 1].astype(np.float32), img[..., 2].astype(np.float32)
    gray = luminance(img)
    maxc = np.maximum(np.maximum(r, g), b)
    blueness = (b - np.maximum(r, g)) / (maxc + 1e-6)  # >0 when blue leads
    blue = blueness > 0.08
    blown = gray > 245  # overcast / blown sky
    flat = local_std(gray, 7) <= texture_max
    region = np.zeros((h, w), bool)
    region[: int(h * top_frac), :] = True
    candidate = ((blue | blown) & flat & region).astype(np.uint8)

    # Keep only components that touch the top edge (true sky, not a pale ceiling).
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, 8)
    top_labels = set(np.unique(labels[0, :])) - {0}
    keep = np.zeros_like(candidate)
    total = h * w
    for i in top_labels:
        if stats[i, cv2.CC_STAT_AREA] >= min_area_frac * total:
            keep[labels == i] = 1
    return soft_from_binary(keep, feather=feather)
