export type PhotoOrderMode = 'filename' | 'captured';
export interface OrderablePhoto {
  id: string;
  filename: string;
  parent_photo_id?: string | null;
  exif?: unknown;
  sort_order?: number | null;
}
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function cleanPhotoFilename(filename: string): string {
  return filename.replace(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_])+/i, '');
}

/** Resolve derivatives to the camera frame, guarding incomplete/cyclic ancestry. */
export function photoOrderMetadata(photo: OrderablePhoto, all: ReadonlyMap<string, OrderablePhoto>) {
  let source = photo;
  const seen = new Set([source.id]);
  let captured: number | null = captureTime(source.exif);
  while (source.parent_photo_id) {
    const parent = all.get(source.parent_photo_id);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    source = parent;
    captured = captureTime(parent.exif) ?? captured;
  }
  return { filename: cleanPhotoFilename(source.filename), captured };
}

export function captureTime(exif: unknown): number | null {
  if (!exif || typeof exif !== 'object') return null;
  const raw = (exif as Record<string, unknown>).DateTimeOriginal;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let value = raw.trim().replace(/^(\d{4}):(\d{2}):(\d{2})[ T]/, '$1-$2-$3T').replace(' ', 'T');
  // Camera wall-clock values have no zone; normalize consistently on browser/server.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) value += 'Z';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function orderPhotos<T extends OrderablePhoto>(photos: T[], mode: PhotoOrderMode): T[] {
  const all = new Map(photos.map(p => [p.id, p]));
  const metadata = new Map(photos.map(p => [p.id, photoOrderMetadata(p, all)]));
  return [...photos].sort((a, b) => {
    const am = metadata.get(a.id)!;
    const bm = metadata.get(b.id)!;
    if (mode === 'captured') {
      if (am.captured === null && bm.captured !== null) return 1;
      if (bm.captured === null && am.captured !== null) return -1;
      if (am.captured !== null && bm.captured !== null && am.captured !== bm.captured) return am.captured - bm.captured;
    }
    return natural.compare(am.filename, bm.filename) || natural.compare(cleanPhotoFilename(a.filename), cleanPhotoFilename(b.filename)) || a.id.localeCompare(b.id);
  });
}

/** A padded prefix keeps the gallery sequence when Finder/MLS sorts the ZIP by name. */
export function deliveryFilename(filename: string, index: number, total: number): string {
  const safe = cleanPhotoFilename(filename).replace(/[\\/\x00-\x1f]/g, '_').replace(/^\.+/, '') || 'photo.jpg';
  return `${String(index + 1).padStart(Math.max(3, String(total).length), '0')}-${safe}`;
}
