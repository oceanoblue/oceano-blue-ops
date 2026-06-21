/**
 * Client-side RAW preview + EXIF extraction.
 *
 * Camera RAW files (Sony ARW, etc.) embed a full-size JPEG preview — the same
 * render the worker pulls server-side. Uploading that ~6 MB preview instead of
 * the 50 MB original is the big upload-speed and storage win. The browser can't
 * decode RAW, but it doesn't need to: we scan the file bytes for the embedded
 * JPEG and read the bracket-defining EXIF straight from the TIFF header.
 *
 * `extractLargestEmbeddedJpeg` and `readRawExifTags` are pure byte functions
 * (unit-tested in node); `extractRawForUpload` is the thin browser wrapper that
 * validates the preview with createImageBitmap and builds the upload File.
 */

/** Long edge a preview must reach to be trusted as the working image. */
export const MIN_PREVIEW_EDGE = 2400;

export interface RawExifTags {
  ExposureBiasValue: number | null;
  DateTimeOriginal: string | null;
  Make?: string;
  Model?: string;
}

// ─── Embedded JPEG extraction ──────────────────────────────────────────────

/** Walk one JPEG starting at `start` (an SOI) and return the index just past
 *  its EOI, or -1 if the structure is invalid. Respects segment lengths and the
 *  entropy-coded scan so a thumbnail embedded inside the preview's APP segments
 *  doesn't truncate it. */
function jpegEnd(b: Uint8Array, start: number): number {
  let i = start + 2; // skip SOI
  const n = b.length;
  while (i < n - 1) {
    if (b[i] !== 0xff) return -1; // not aligned on a marker → invalid
    let marker = b[i + 1];
    // Skip fill bytes (a run of 0xFF).
    while (marker === 0xff && i + 2 < n) {
      i++;
      marker = b[i + 1];
    }
    if (marker === 0xd9) return i + 2; // EOI
    // Markers without a length payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 4 > n) return -1;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return -1;
    if (marker === 0xda) {
      // Start of Scan: skip the header, then the entropy-coded data up to the
      // next real marker (ignoring stuffed 0xFF00 and restart markers).
      i += 2 + len;
      while (i < n - 1) {
        if (b[i] === 0xff) {
          const m = b[i + 1];
          if (m === 0x00 || (m >= 0xd0 && m <= 0xd7)) {
            i += 2;
            continue;
          }
          if (m === 0xff) {
            i++;
            continue;
          }
          break; // real marker (next scan for progressive, or EOI)
        }
        i++;
      }
      continue;
    }
    i += 2 + len; // APPn / DQT / DHT / SOFn / COM …
  }
  return -1;
}

/**
 * Find the largest embedded JPEG in a RAW (or any) byte buffer. Returns the
 * JPEG bytes or null. "Largest" reliably picks the full-size preview over the
 * small thumbnail.
 */
export function extractLargestEmbeddedJpeg(b: Uint8Array): Uint8Array | null {
  let best: { start: number; end: number } | null = null;
  const n = b.length;
  for (let i = 0; i < n - 2; i++) {
    // A real JPEG starts FF D8 FF (SOI followed by a marker).
    if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff) {
      const end = jpegEnd(b, i);
      if (end > i) {
        if (!best || end - i > best.end - best.start) best = { start: i, end };
        i = end - 1; // don't rescan inside this JPEG
      }
    }
  }
  return best ? b.subarray(best.start, best.end) : null;
}

// ─── TIFF / EXIF tag reading ───────────────────────────────────────────────

const TAG_EXIF_IFD = 0x8769;
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_EXPOSURE_BIAS = 0x9204;
const TAG_DATETIME_ORIGINAL = 0x9003;
// EXIF type → byte size.
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function makeReaders(b: Uint8Array, le: boolean) {
  const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    (le
      ? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)
      : (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const s32 = (o: number) => u32(o) | 0;
  return { u16, u32, s32 };
}

/**
 * Read bracket-relevant EXIF directly from a TIFF-based RAW (or TIFF) buffer.
 * Returns ExposureBiasValue (the tag exifr drops on Sony ARW), DateTimeOriginal
 * (as "YYYY-MM-DDTHH:MM:SS"), and camera make/model. Best-effort: any field that
 * can't be read is simply omitted/null.
 */
export function readRawExifTags(b: Uint8Array): RawExifTags {
  const out: RawExifTags = { ExposureBiasValue: null, DateTimeOriginal: null };
  try {
    if (b.length < 8) return out;
    let le: boolean;
    if (b[0] === 0x49 && b[1] === 0x49) le = true;
    else if (b[0] === 0x4d && b[1] === 0x4d) le = false;
    else return out;
    const { u16, u32, s32 } = makeReaders(b, le);
    if (u16(2) !== 0x2a) return out;

    const ascii = (off: number, count: number) => {
      let s = '';
      for (let k = 0; k < count && off + k < b.length; k++) {
        const c = b[off + k];
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    };

    const readIFD = (ifdOff: number, want: (tag: number, type: number, count: number, valOff: number) => void) => {
      if (ifdOff <= 0 || ifdOff + 2 > b.length) return;
      const entries = u16(ifdOff);
      for (let e = 0; e < entries; e++) {
        const ent = ifdOff + 2 + e * 12;
        if (ent + 12 > b.length) break;
        const tag = u16(ent);
        const type = u16(ent + 2);
        const count = u32(ent + 4);
        const size = (TYPE_SIZE[type] ?? 1) * count;
        const valOff = size <= 4 ? ent + 8 : u32(ent + 8);
        want(tag, type, count, valOff);
      }
    };

    let exifIFD = 0;
    readIFD(u32(4), (tag, _type, count, valOff) => {
      if (tag === TAG_EXIF_IFD) exifIFD = u32(valOff);
      else if (tag === TAG_MAKE) out.Make = ascii(valOff, count);
      else if (tag === TAG_MODEL) out.Model = ascii(valOff, count);
    });

    if (exifIFD) {
      readIFD(exifIFD, (tag, _type, count, valOff) => {
        if (tag === TAG_EXPOSURE_BIAS) {
          const num = s32(valOff);
          const den = s32(valOff + 4);
          if (den !== 0) out.ExposureBiasValue = num / den;
        } else if (tag === TAG_DATETIME_ORIGINAL) {
          const raw = ascii(valOff, count); // "YYYY:MM:DD HH:MM:SS"
          const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
          if (m) out.DateTimeOriginal = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
        }
      });
    }
  } catch {
    /* best-effort */
  }
  return out;
}

// ─── Browser wrapper ───────────────────────────────────────────────────────

export interface RawPreviewResult {
  file: File;
  exif: RawExifTags;
  width: number;
  height: number;
}

/**
 * Extract the embedded full-size preview + EXIF from a RAW File for upload.
 * Returns null when there's no usable preview (long edge < MIN_PREVIEW_EDGE or
 * it won't decode) so the caller can fall back to uploading the original RAW.
 * Browser-only (uses createImageBitmap).
 */
export async function extractRawForUpload(original: File): Promise<RawPreviewResult | null> {
  try {
    if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return null;
    const bytes = new Uint8Array(await original.arrayBuffer());
    const jpeg = extractLargestEmbeddedJpeg(bytes);
    if (!jpeg) return null;

    // Decode (baking in EXIF orientation) so we can validate it's a real,
    // full-size preview — not the small thumbnail — and normalize it.
    const blob = new Blob([jpeg.slice()], { type: 'image/jpeg' });
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as any);
    } catch {
      return null; // not a decodable JPEG → fall back to the original RAW
    }
    if (Math.max(bmp.width, bmp.height) < MIN_PREVIEW_EDGE) {
      bmp.close?.();
      return null;
    }

    // Canvas round-trip to bake in orientation + cap the long edge, matching the
    // rest of the pipeline (worker .rotate(); compressImageFile). EXIF is read
    // from the RAW header below, so the stripped canvas output is fine.
    const maxEdge = 4096;
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const width = Math.max(1, Math.round(bmp.width * scale));
    const height = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close?.();
      return null;
    }
    ctx.drawImage(bmp, 0, 0, width, height);
    bmp.close?.();
    const outBlob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!outBlob) return null;

    const exif = readRawExifTags(bytes);
    const name = original.name.replace(/\.[^.]+$/, '.jpg');
    const file = new File([outBlob], name, { type: 'image/jpeg' });
    return { file, exif, width, height };
  } catch {
    return null;
  }
}
