import sharp from 'sharp';

/**
 * Structure-drift QC: did a GENERATIVE edit redraw the scene, not just relight it?
 *
 * A generative provider (GPT Image, Nano Banana) got closest to the target look
 * in real comparisons, but it can subtly alter real content — cabinet hardware,
 * a faucet profile, a chair back. For a real-estate listing that's a fidelity
 * problem no tone check catches: the photo can be beautifully graded AND lying.
 *
 * The signal: normalized cross-correlation between the EDGE STRUCTURE (Sobel
 * gradient magnitude) of the original and the edited output. NCC is invariant
 * to affine intensity changes, so any honest relight/regrade — however heavy —
 * scores high; redrawn geometry decorrelates. Gradient maps are lightly box-
 * blurred first so a ~1px re-encode shimmy doesn't read as drift.
 *
 * Scope: only meaningful for generative outputs. The deterministic engine
 * legitimately warps pixels (lens correction, keystone), which would false-
 * positive here — callers must gate on the provider. Informational signal
 * (surfaced per photo), not a verdict gate, until validated on real data.
 */
export interface StructureStats {
  /** Edge-structure correlation, 0..1 (1 = same structure). */
  score: number;
  /** True when the score falls below DRIFT_THRESHOLD. */
  drifted: boolean;
}

/** Below this edge-structure correlation, flag the output for human review. */
export const DRIFT_THRESHOLD = 0.55;

/** Comparison resolution. Small enough to be cheap, big enough that furniture-
 *  scale geometry survives; both frames are forced to exactly this size so the
 *  maps are comparable even if the provider re-rendered at a new aspect. */
const CMP_W = 256;
const CMP_H = 256;

/** Sobel gradient magnitude of a grayscale raw buffer, box-blurred 3×3. */
export function gradientMagnitude(gray: Uint8Array | Buffer, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
        gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  // 3×3 box blur → tolerance to sub-pixel misregistration from re-encoding.
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] =
        (mag[i - w - 1] + mag[i - w] + mag[i - w + 1] +
          mag[i - 1] + mag[i] + mag[i + 1] +
          mag[i + w - 1] + mag[i + w] + mag[i + w + 1]) / 9;
    }
  }
  return out;
}

/** Zero-mean normalized cross-correlation of two equal-length maps, clamped ≥0. */
export function ncc(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  if (den <= 1e-9) return 1; // both structureless (flat) → no drift signal
  return Math.max(0, num / den);
}

/** Pure core: structure correlation between two same-size grayscale buffers. */
export function structureScoreFromRaw(
  origGray: Uint8Array | Buffer,
  editGray: Uint8Array | Buffer,
  w: number,
  h: number
): StructureStats {
  const score = ncc(gradientMagnitude(origGray, w, h), gradientMagnitude(editGray, w, h));
  return { score: Math.round(score * 1000) / 1000, drifted: score < DRIFT_THRESHOLD };
}

/** Decode both images to a fixed-size grayscale and compare. Null on failure. */
export async function computeStructureDrift(
  original: Buffer,
  edited: Buffer
): Promise<StructureStats | null> {
  try {
    const toGray = (buf: Buffer) =>
      sharp(buf)
        .rotate()
        .resize(CMP_W, CMP_H, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();
    const [a, b] = await Promise.all([toGray(original), toGray(edited)]);
    return structureScoreFromRaw(a, b, CMP_W, CMP_H);
  } catch {
    return null;
  }
}
