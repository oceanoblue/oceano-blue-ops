/**
 * Optional client-side image compression before upload.
 *
 * Real-estate deliverables are web/MLS JPEGs and the whole pipeline (HDR merge +
 * AI enhance) already works from JPEG, so shrinking browser-decodable images to
 * a sensible web resolution before upload is a large, safe speed win.
 *
 * Only JPEG/PNG/WebP can be decoded + re-encoded in the browser; RAW and TIFF
 * are returned untouched (the browser can't transcode them). EXIF is NOT
 * preserved by the canvas round-trip — callers must read EXIF from the ORIGINAL
 * file (we bake in orientation via `imageOrientation: 'from-image'` so the
 * stripped-orientation result still displays correctly).
 */
const COMPRESSIBLE = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export interface CompressOptions {
  maxEdge?: number;
  quality?: number;
}

export async function compressImageFile(file: File, opts: CompressOptions = {}): Promise<File> {
  // When compression IS opted into (it's off by default now), keep near-native
  // detail: 6144px long edge at q0.95. The old 4096/q0.88 default was discarding
  // most of a full-frame capture's resolution at ingest.
  const maxEdge = opts.maxEdge ?? 6144;
  const quality = opts.quality ?? 0.95;
  if (!COMPRESSIBLE.has(file.type)) return file;
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    // Keep the original if re-encoding didn't actually shrink it.
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
