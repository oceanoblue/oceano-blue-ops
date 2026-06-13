import sharp from 'sharp';

/**
 * Perceptual fingerprint for near-duplicate detection. Server-only (uses sharp).
 *
 *  - hash: a 64-bit dHash (difference hash). Robust to resize/JPEG/minor
 *    exposure shifts; near-identical frames land within a few bits of each other.
 *  - sharpness: variance of a Laplacian-convolved greyscale downscale — a
 *    standard focus measure. Higher = crisper, so the cluster's keeper is the
 *    frame with the highest value.
 */
export interface Fingerprint {
  hash: bigint;
  sharpness: number;
}

/** 64-bit difference hash: 9x8 greyscale, compare each pixel to its right neighbour. */
async function dHash(bytes: Buffer): Promise<bigint> {
  const w = 9;
  const h = 8;
  const raw = await sharp(bytes)
    .rotate()
    .greyscale()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer();

  let hash = 0n;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w - 1; col++) {
      const left = raw[row * w + col];
      const right = raw[row * w + col + 1];
      hash = (hash << 1n) | (left < right ? 1n : 0n);
    }
  }
  return hash;
}

/** Laplacian-variance focus measure on a 256px greyscale downscale. */
async function sharpnessScore(bytes: Buffer): Promise<number> {
  const size = 256;
  const raw = await sharp(bytes)
    .rotate()
    .greyscale()
    .resize(size, size, { fit: 'inside' })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
    .raw()
    .toBuffer();

  // Variance of the convolved signal.
  let sum = 0;
  for (let i = 0; i < raw.length; i++) sum += raw[i];
  const mean = sum / raw.length;
  let varSum = 0;
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i] - mean;
    varSum += d * d;
  }
  return varSum / raw.length;
}

export async function fingerprint(bytes: Buffer): Promise<Fingerprint> {
  const [hash, sharpness] = await Promise.all([dHash(bytes), sharpnessScore(bytes)]);
  return { hash, sharpness };
}
