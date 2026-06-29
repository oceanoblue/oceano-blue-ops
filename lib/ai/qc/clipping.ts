import sharp from 'sharp';

/**
 * Highlight-clipping QC: how much of the frame has blown to detail-less white.
 *
 * The faithful grade exists to HOLD highlight detail (windows keep their view,
 * bright walls keep tone) — its highlight roll-off is built for exactly this.
 * When a large fraction of a frame is hard-clipped to ~white, that detail is
 * gone. Premium profiles (architectural / interior / luxury) care; MLS tolerates
 * a brighter, airier look. This is the deterministic SIGNAL that flags which
 * photos want the assisted window-pull finish (Phase D) — a detector, never an
 * auto-edit, so it can't degrade output.
 *
 * The pure scorer is unit-tested; the sharp wrapper mirrors color-stats.ts.
 */
export interface ClippingStats {
  /** Fraction (0–1) of pixels hard-clipped to near-white across all channels. */
  blownFraction: number;
  /** Pixels sampled. */
  sampled: number;
}

/** A pixel is "blown" when every channel is at/above this 0–255 level — i.e.
 *  it carries essentially no highlight detail. Conservative (≥ 252, not 250) so
 *  a normally bright wall isn't mistaken for lost detail. */
export const BLOWN_LEVEL = 252;

/**
 * Pure core: fraction of blown pixels in a packed RGB(A) raw buffer. Kept free
 * of any decode so it's deterministic and testable with synthetic data.
 */
export function blownFractionFromRaw(
  data: Uint8Array | Buffer,
  channels: number,
  level: number = BLOWN_LEVEL
): ClippingStats {
  if (channels < 3 || data.length < channels) return { blownFraction: 0, sampled: 0 };
  const n = Math.floor(data.length / channels);
  let blown = 0;
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    if (data[p] >= level && data[p + 1] >= level && data[p + 2] >= level) blown++;
  }
  return { blownFraction: n ? blown / n : 0, sampled: n };
}

/** Decode (downscaled) + measure blown-highlight fraction. Null on failure. */
export async function computeClipping(buf: Buffer): Promise<ClippingStats | null> {
  try {
    const { data, info } = await sharp(buf)
      .rotate()
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return blownFractionFromRaw(data, info.channels);
  } catch {
    return null;
  }
}
