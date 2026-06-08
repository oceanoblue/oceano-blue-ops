/**
 * Browser-side thumbnail generation for Real Estate Photo Rescue v2.
 *
 * Produces a small JPEG preview from a local file WITHOUT uploading the
 * original. Strategy:
 *   - JPEG/PNG/WebP : decode with createImageBitmap and downscale on a canvas.
 *   - RAW (ARW/CR2…): pull the camera-embedded JPEG preview via exifr.thumbnail,
 *     then downscale that.
 *   - Anything else : best-effort embedded preview, else null.
 *
 * Returns null on failure — the review UI falls back to filename + EV display.
 */
const MAX_EDGE = 512;
const QUALITY = 0.72;
const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;

export interface ClientThumbnail {
  blob: Blob;
  mime: string;
}

async function downscaleBitmap(bmp: ImageBitmap): Promise<Blob | null> {
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY));
}

export async function generateThumbnail(file: File): Promise<ClientThumbnail | null> {
  try {
    let sourceBlob: Blob | null = null;

    if (RAW_EXT.test(file.name)) {
      const exifr = (await import('exifr')).default;
      const thumb = await exifr.thumbnail(file); // Uint8Array of embedded JPEG
      if (thumb) sourceBlob = new Blob([thumb as unknown as BlobPart], { type: 'image/jpeg' });
    } else {
      sourceBlob = file;
    }

    if (!sourceBlob) {
      // Last resort: try the embedded preview even for non-RAW (HEIC/TIFF).
      try {
        const exifr = (await import('exifr')).default;
        const thumb = await exifr.thumbnail(file);
        if (thumb) sourceBlob = new Blob([thumb as unknown as BlobPart], { type: 'image/jpeg' });
      } catch {
        /* ignore */
      }
    }
    if (!sourceBlob) return null;

    const bmp = await createImageBitmap(sourceBlob);
    const blob = await downscaleBitmap(bmp);
    bmp.close?.();
    if (!blob) return null;
    return { blob, mime: 'image/jpeg' };
  } catch {
    return null;
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? ''); // strip "data:...;base64,"
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
