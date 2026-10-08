import sharp from 'sharp';

// Leave headroom below the provider's 50 MB per-image upload limit.
export const IMAGE_INPUT_MAX_BYTES = 49_000_000;

/** Preserve normal inputs byte-for-byte. Oversized inputs stay lossless PNGs;
 * reduce pixel dimensions only if lossless recompression cannot fit the limit. */
export async function fitImageInput(bytes: Buffer, filename: string, mimeType: string) {
  if (bytes.length <= IMAGE_INPUT_MAX_BYTES) return { bytes, filename, mimeType };
  const source = sharp(bytes, { limitInputPixels: 100_000_000 }).rotate();
  let output = await source.clone().png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  let width = output.info.width;
  let height = output.info.height;
  for (let attempt = 0; output.data.length > IMAGE_INPUT_MAX_BYTES && attempt < 4; attempt++) {
    const scale = Math.min(0.9, Math.sqrt(IMAGE_INPUT_MAX_BYTES / output.data.length) * 0.95);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
    output = await source.clone().resize({ width, height, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  }
  if (output.data.length > IMAGE_INPUT_MAX_BYTES) throw new Error('Image could not be sized for editing.');
  return { bytes: output.data, filename: filename.replace(/\.[^.]+$/, '') + '.png', mimeType: 'image/png' };
}
