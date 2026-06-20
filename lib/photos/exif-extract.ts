/**
 * Client-side EXIF extraction at upload time.
 *
 * We read the bracket-relevant tags directly from the File (works for JPEG and
 * TIFF-based RAW — ARW/CR2/NEF/DNG/RAF) and persist them to photos.exif via the
 * register route. Having ExposureBiasValue + DateTimeOriginal on every frame is
 * what lets bracket detection tell a real HDR set apart from an in-sequence
 * detail single — without re-fetching each image later.
 */
export interface UploadExif {
  DateTimeOriginal?: string;
  ExposureBiasValue?: number;
  Make?: string;
  Model?: string;
  LensModel?: string;
  FocalLength?: number;
}

export async function extractUploadExif(file: File): Promise<UploadExif> {
  try {
    const exifr = (await import('exifr')).default;
    const t = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'ExposureBiasValue', 'Make', 'Model', 'LensModel', 'FocalLength'],
    });
    if (!t) return {};
    const out: UploadExif = {};
    if (t.DateTimeOriginal instanceof Date) out.DateTimeOriginal = t.DateTimeOriginal.toISOString();
    else if (typeof t.DateTimeOriginal === 'string') out.DateTimeOriginal = t.DateTimeOriginal;
    if (typeof t.ExposureBiasValue === 'number') out.ExposureBiasValue = t.ExposureBiasValue;
    if (typeof t.Make === 'string') out.Make = t.Make.trim();
    if (typeof t.Model === 'string') out.Model = t.Model.trim();
    if (typeof t.LensModel === 'string') out.LensModel = t.LensModel.trim();
    if (typeof t.FocalLength === 'number') out.FocalLength = t.FocalLength;
    return out;
  } catch {
    return {};
  }
}
