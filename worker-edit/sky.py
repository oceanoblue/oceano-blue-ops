"""
Sky replacement (P4) — profile-gated.

Marketing tiers (MLS / luxury) benefit from a clean, appealing sky when the real
one is a blown white overcast. The faithful tiers (architectural / interior,
grade style "sober") must NOT have their skies invented — accuracy is the
product — so for those this is a deliberate no-op.

This composites a replacement sky into the sky mask, feathered at the horizon,
and weighted toward the BLOWN parts of the sky (so a sky that already has real
blue/cloud detail is largely kept). A supplied sky image is used if given,
otherwise a tasteful procedural gradient. Deterministic; a generative sky can be
layered on later via the existing generative route. Unit-tested in test_sky.py.
"""
from typing import Optional

import cv2
import numpy as np

from masks import luminance, sky_mask

# Profiles that keep the real sky untouched.
FAITHFUL_STYLES = {"sober"}


def procedural_sky(h: int, w: int) -> np.ndarray:
    """A soft daylight gradient — light azure up top easing to a pale haze at the
    horizon. BGR uint8."""
    top = np.array([230, 170, 110], np.float32)     # B,G,R — azure
    bottom = np.array([245, 232, 220], np.float32)  # pale near-horizon haze
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]  # 0 top → 1 bottom
    col = top[None, :] * (1 - t) + bottom[None, :] * t       # h x 3
    return np.repeat(col[:, None, :], w, axis=1).astype(np.uint8)


def replace_sky(
    img: np.ndarray,
    mask: Optional[np.ndarray] = None,
    *,
    style: str = "default",
    sky: Optional[np.ndarray] = None,
    strength: float = 0.9,
    blown_lo: float = 200.0,
    blown_hi: float = 252.0,
) -> np.ndarray:
    """Composite a replacement sky into the sky region. No-op for faithful
    styles. Returns BGR uint8, same shape as `img`."""
    if style in FAITHFUL_STYLES:
        return img

    h, w = img.shape[:2]
    if mask is None:
        mask = sky_mask(img)
    if float(mask.max()) <= 0:
        return img

    replacement = procedural_sky(h, w) if sky is None else cv2.resize(sky, (w, h), interpolation=cv2.INTER_AREA)

    # Weight toward the blown part of the sky so existing blue/cloud detail stays.
    lum = luminance(img)
    t = np.clip((lum - blown_lo) / max(blown_hi - blown_lo, 1e-6), 0.0, 1.0)
    blown = t * t * (3.0 - 2.0 * t)
    w_blend = np.clip(mask * blown * float(strength), 0.0, 1.0)[..., None]

    out = img.astype(np.float32) * (1.0 - w_blend) + replacement.astype(np.float32) * w_blend
    return np.clip(out, 0, 255).astype(np.uint8)
