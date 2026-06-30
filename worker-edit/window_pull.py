"""
Window pull (P1) — the flagship real-estate-editing move.

When a room is exposed correctly, bright windows blow out to flat white and lose
the exterior view. A global exposure can't fix this (lifting the room brightens
the window further). The fix, done by AutoHDR/Imagen/Autoenhance: detect the
window regions and pull the SAME pixels from a DARKER bracket (which still holds
the view) into just those regions, feathered.

This is deterministic and bracket-based — it only recovers detail the camera
actually captured, in line with the engine's "faithful, never hallucinated"
stance. It blends the darker frame ONLY where the fused image is both (a) inside
a window mask and (b) genuinely blown, so a window that already reads fine, or a
bright wall, is left alone.

Pure NumPy/OpenCV; unit-tested in test_window_pull.py. (For single-exposure
input there is no darker frame to pull from — recovering a blown view there is a
generative job, handled elsewhere.)
"""
from typing import List, Optional

import cv2
import numpy as np

from masks import luminance, window_mask


def pick_darkest(images: List[np.ndarray]) -> np.ndarray:
    """The bracket that best holds highlights = the one with the lowest median
    luminance."""
    return min(images, key=lambda im: float(np.median(luminance(im))))


def _smoothstep(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    t = np.clip((x - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def window_pull(
    fused: np.ndarray,
    darkest: np.ndarray,
    mask: Optional[np.ndarray] = None,
    *,
    blown_lo: float = 200.0,
    blown_hi: float = 252.0,
    strength: float = 1.0,
) -> np.ndarray:
    """Blend `darkest` into `fused` inside the window mask, weighted by how blown
    the fused pixel is. Returns BGR uint8, same shape as `fused`."""
    if darkest.shape[:2] != fused.shape[:2]:
        darkest = cv2.resize(darkest, (fused.shape[1], fused.shape[0]), interpolation=cv2.INTER_AREA)
    if mask is None:
        mask = window_mask(fused)
    if float(mask.max()) <= 0:
        return fused

    blown = _smoothstep(luminance(fused), blown_lo, blown_hi)  # only pull blown areas
    w = np.clip(mask * blown * float(strength), 0.0, 1.0)[..., None]  # HxWx1
    out = fused.astype(np.float32) * (1.0 - w) + darkest.astype(np.float32) * w
    return np.clip(out, 0, 255).astype(np.uint8)
