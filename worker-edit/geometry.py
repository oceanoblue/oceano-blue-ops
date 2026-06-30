"""
Vertical / perspective correction (P2).

Real-estate + architectural shots want plumb verticals: walls and door frames
should be parallel and upright, not tilted (camera roll) or converging (camera
tilted up/down — "keystoning"). This module detects the strong near-vertical
edges and applies a BOUNDED correction:

  1. de-skew  — rotate so verticals are upright (fixes roll),
  2. keystone — a bounded vertical perspective warp that counteracts convergence.

Both corrections are clamped hard (a few degrees / a small perspective factor) so
a mis-detection can never wildly warp a frame, and the result is cropped back to
the original size (no black borders). The estimators are pure + unit-tested;
the warp's visual quality is validated on real renders on the Mac.
"""
import math
from typing import Optional

import cv2
import numpy as np


def detect_vertical_lines(img: np.ndarray, max_tilt_deg: float = 25.0, min_len_frac: float = 0.18) -> np.ndarray:
    """Near-vertical line segments as an Nx4 array [x1,y1,x2,y2]. Uses the LSD
    detector when present, else probabilistic Hough."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    h, w = gray.shape[:2]
    min_len = min_len_frac * h
    segs = []
    try:
        lsd = cv2.createLineSegmentDetector()
        lines = lsd.detect(gray)[0]
        raw = [] if lines is None else [l[0] for l in lines]
    except Exception:
        edges = cv2.Canny(gray, 60, 180)
        hough = cv2.HoughLinesP(edges, 1, np.pi / 180, 80, minLineLength=int(min_len), maxLineGap=10)
        raw = [] if hough is None else [l[0] for l in hough]

    for x1, y1, x2, y2 in raw:
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < min_len:
            continue
        tilt = abs(math.degrees(math.atan2(dx, dy)))  # 0 = vertical
        tilt = min(tilt, 180 - tilt)
        if tilt <= max_tilt_deg:
            segs.append([x1, y1, x2, y2])
    return np.array(segs, dtype=np.float64) if segs else np.empty((0, 4))


def vertical_skew_degrees(lines: np.ndarray) -> float:
    """Median signed angle (deg) of near-vertical lines from true vertical.
    Positive = top leans right. Pure."""
    if len(lines) == 0:
        return 0.0
    angles = []
    for x1, y1, x2, y2 in lines:
        dx, dy = x2 - x1, y2 - y1
        if dy < 0:  # orient downward so the sign is consistent
            dx, dy = -dx, -dy
        angles.append(math.degrees(math.atan2(dx, dy)))
    return float(np.median(angles))


def keystone_strength(lines: np.ndarray, h: int, w: int) -> float:
    """Convergence of verticals, as the slope of each line's tilt against its
    horizontal position. >0 ⇒ verticals converge toward the top (camera tilted
    up); ~0 ⇒ already parallel. Normalised to roughly [-1, 1]. Pure."""
    if len(lines) < 2:
        return 0.0
    xs, tilts = [], []
    for x1, y1, x2, y2 in lines:
        # x at top (y=0) and bottom (y=h) by linear extrapolation.
        if abs(y2 - y1) < 1e-6:
            continue
        slope = (x2 - x1) / (y2 - y1)
        x_top = x1 + slope * (0 - y1)
        x_bot = x1 + slope * (h - y1)
        xs.append(((x_top + x_bot) / 2 - w / 2) / (w / 2))  # centered, normalised
        tilts.append((x_top - x_bot) / w)                    # +ve ⇒ top is right of bottom
    if len(xs) < 2:
        return 0.0
    xs, tilts = np.array(xs), np.array(tilts)
    var = float(np.var(xs))
    if var < 1e-9:
        return 0.0
    # Lines left of center leaning right + lines right leaning left ⇒ converging
    # top ⇒ negative covariance(x, tilt). Flip sign so converging-top ⇒ positive.
    slope = -float(np.cov(xs, tilts, bias=True)[0, 1] / var)
    return float(np.clip(slope, -1.0, 1.0))


def _crop_resize(warped: np.ndarray, inset: float, h: int, w: int) -> np.ndarray:
    """Crop a symmetric inset (to drop warp borders) and resize back to (w,h)."""
    inset = float(np.clip(inset, 0.0, 0.25))
    dx, dy = int(w * inset), int(h * inset)
    cropped = warped[dy : h - dy, dx : w - dx] if (dx or dy) else warped
    if cropped.size == 0:
        return warped
    return cv2.resize(cropped, (w, h), interpolation=cv2.INTER_AREA)


def straighten_verticals(
    img: np.ndarray,
    *,
    max_deg: float = 4.0,
    max_keystone: float = 0.10,
    apply_keystone: bool = True,
    lines: Optional[np.ndarray] = None,
) -> np.ndarray:
    """De-skew (bounded rotation) and optionally apply a bounded keystone warp so
    verticals read plumb. Returns BGR uint8 at the original size. A no-op when no
    confident verticals are found or the scene is already straight."""
    h, w = img.shape[:2]
    if lines is None:
        lines = detect_vertical_lines(img)
    if len(lines) == 0:
        return img

    out = img
    # 1. De-skew: rotate to cancel the (clamped) median tilt. The correction is
    #    the NEGATIVE of the measured skew (verified end-to-end: rotating by
    #    -skew drives residual tilt to ~0; +skew doubles it).
    skew = float(np.clip(vertical_skew_degrees(lines), -max_deg, max_deg))
    if abs(skew) > 0.15:
        M = cv2.getRotationMatrix2D((w / 2, h / 2), -skew, 1.0)
        out = cv2.warpAffine(out, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        out = _crop_resize(out, abs(skew) / 90.0 + 0.01, h, w)

    # 2. Keystone: counteract convergence with a bounded vertical perspective.
    if apply_keystone:
        k = float(np.clip(keystone_strength(lines, h, w), -max_keystone, max_keystone))
        if abs(k) > 0.01:
            # Converging top (k>0) ⇒ widen the top edge to make verticals parallel.
            shift = (k * w) / 2.0
            src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
            dst = np.float32([[-shift, 0], [w + shift, 0], [w, h], [0, h]])
            H = cv2.getPerspectiveTransform(src, dst)
            out = cv2.warpPerspective(out, H, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            out = _crop_resize(out, abs(k) + 0.01, h, w)

    return out
