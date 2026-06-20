import sharp from 'sharp';

/**
 * Per-image color statistics for batch QC. The key signal is the **white-balance
 * cast** measured on the brightest, near-neutral pixels (ceilings, trim,
 * cabinetry) — those should read true-neutral, so their average a*,b* in CIELAB
 * is the photo's color cast. Comparing that cast across a set surfaces "this
 * photo runs warmer/cooler/greener than the others" without being fooled by
 * legitimately different room content (a green lawn vs a white bathroom).
 */
export interface ColorStats {
  /** Mean lightness of the neutral reference pixels (0–100). */
  L: number;
  /** White-balance cast on neutrals: a* = green(−)…magenta(+). */
  a: number;
  /** White-balance cast on neutrals: b* = blue(−)…yellow(+) (warm = positive). */
  b: number;
  /** Mean chroma across the whole image (0+) — a rough saturation/"punch" gauge. */
  saturation: number;
  /** How many near-neutral pixels informed the white point. */
  neutralPixels: number;
}

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function fLab(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

// sRGB (D65) → CIELAB.
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // D65 reference white
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const fx = fLab(x);
  const fy = fLab(y);
  const fz = fLab(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export async function computeColorStats(buf: Buffer): Promise<ColorStats | null> {
  try {
    const { data, info } = await sharp(buf)
      .rotate()
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const ch = info.channels; // 3 after removeAlpha
    const n = info.width * info.height;
    if (n === 0) return null;

    // Pass 1: compute L for every pixel + accumulate whole-image chroma.
    const labs: Array<[number, number, number]> = new Array(n);
    let satSum = 0;
    let lMax = 0;
    for (let i = 0, p = 0; i < n; i++, p += ch) {
      const lab = rgbToLab(data[p], data[p + 1], data[p + 2]);
      labs[i] = lab;
      const chroma = Math.hypot(lab[1], lab[2]);
      satSum += chroma;
      if (lab[0] > lMax) lMax = lab[0];
    }

    // White point: bright (top of the lightness range) + low-chroma pixels.
    const lThreshold = Math.max(60, lMax - 18);
    let aSum = 0;
    let bSum = 0;
    let lSum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const [L, a, b] = labs[i];
      if (L >= lThreshold && Math.hypot(a, b) < 12) {
        aSum += a;
        bSum += b;
        lSum += L;
        count++;
      }
    }

    // Fallback: if too few neutral pixels (very colorful frame), use the
    // brightest-quartile average so we still get a usable cast estimate.
    if (count < Math.max(20, n * 0.002)) {
      aSum = bSum = lSum = 0;
      count = 0;
      for (let i = 0; i < n; i++) {
        const [L, a, b] = labs[i];
        if (L >= lThreshold) {
          aSum += a;
          bSum += b;
          lSum += L;
          count++;
        }
      }
    }
    if (count === 0) return null;

    return {
      L: lSum / count,
      a: aSum / count,
      b: bSum / count,
      saturation: satSum / n,
      neutralPixels: count,
    };
  } catch {
    return null;
  }
}
