import type { Photo } from '@/lib/supabase/database.types';

/**
 * Client-side bracket grouping by filename sequence.
 *
 * Real estate HDR brackets are almost always shot back-to-back, so the camera
 * writes them with consecutive numeric filenames (e.g. OBM03879, OBM03880,
 * OBM03881). We extract the trailing number from each filename, sort by it,
 * and find runs of length 3, 5, or 7 — the only bracket sizes that show up in
 * practice. Everything else is treated as a single.
 *
 * This is fast, runs in the browser, and is correct ~95% of the time for
 * photographer-uploaded sessions. A server-side EXIF fallback can confirm or
 * override later by checking the actual ExposureBiasValue tag.
 */

export interface BracketGroup {
  id: string;
  photos: Photo[]; // sorted by sequence number, darkest-first by convention
  detectedSize: 3 | 5 | 7;
}

export interface GroupingResult {
  brackets: BracketGroup[];
  singles: Photo[];
}

const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;
// Allowed bracket sizes — anything else falls through to singles.
const BRACKET_SIZES: Array<3 | 5 | 7> = [3, 5, 7];

/** Pull the trailing numeric portion of a filename. Returns null if none. */
function parseSequence(filename: string): { base: string; num: number } | null {
  // Strip extension first so we don't match e.g. "OBM03879.ARW" as base="OBM" num=03879ARW
  const noExt = filename.replace(/\.[^./]+$/, '');
  const match = noExt.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  return { base: match[1], num: parseInt(match[2], 10) };
}

/**
 * Returns the largest bracket size (7, 5, or 3) that the next photos form a
 * sequential run of. Returns 0 if no valid bracket starts here.
 */
function detectBracketAt(sorted: Photo[], index: number): 0 | 3 | 5 | 7 {
  for (const size of [7, 5, 3] as const) {
    if (index + size > sorted.length) continue;

    const head = parseSequence(sorted[index].filename);
    if (!head) continue;

    let sequential = true;
    for (let k = 1; k < size; k++) {
      const next = parseSequence(sorted[index + k].filename);
      if (!next || next.base !== head.base || next.num !== head.num + k) {
        sequential = false;
        break;
      }
    }

    if (sequential) return size;
  }
  return 0;
}

export function groupPhotosIntoBrackets(photos: Photo[]): GroupingResult {
  // Sort by (base, num) so consecutive shots cluster together.
  const sortable: Array<{ photo: Photo; seq: ReturnType<typeof parseSequence> }> =
    photos.map((p) => ({ photo: p, seq: parseSequence(p.filename) }));

  sortable.sort((a, b) => {
    if (!a.seq || !b.seq) return a.photo.filename.localeCompare(b.photo.filename);
    if (a.seq.base !== b.seq.base) return a.seq.base.localeCompare(b.seq.base);
    return a.seq.num - b.seq.num;
  });

  const sorted = sortable.map((s) => s.photo);
  const brackets: BracketGroup[] = [];
  const singles: Photo[] = [];

  let i = 0;
  while (i < sorted.length) {
    const size = detectBracketAt(sorted, i);
    if (size > 0) {
      brackets.push({
        id: `bracket-${sorted[i].id}`,
        photos: sorted.slice(i, i + size),
        detectedSize: size,
      });
      i += size;
    } else {
      singles.push(sorted[i]);
      i++;
    }
  }

  return { brackets, singles };
}

export function isRawFilename(filename: string): boolean {
  return RAW_EXT.test(filename);
}

// ─── EXIF-based fallback grouping ─────────────────────────────────────────
// When filename sequencing misses a bracket (e.g. files renamed in batches,
// or shot with two cameras whose serials interleave), we can still recover
// the set by reading EXIF tags client-side. Brackets share the same capture
// timestamp window and have distinct ExposureBiasValue tags (typically
// -2, 0, +2 or similar).
//
// We use this as a *secondary* pass: it only considers photos that the
// filename pass left in `singles`. That way we never destroy a high-confidence
// filename match in favor of a fuzzy EXIF guess.

export interface ExifSnapshot {
  /** Capture time in ms since epoch, from DateTimeOriginal. */
  takenAt: number | null;
  /** EV bias from ExposureBiasValue (e.g. -2, 0, +2). */
  exposureBias: number | null;
}

const EXIF_TIME_WINDOW_MS = 4000; // brackets are shot back-to-back, usually <2s apart

/**
 * Browser-side: pull DateTimeOriginal and ExposureBiasValue from a signed URL
 * to a JPEG. Returns null on RAW or any parse error. Imports `exifr` lazily
 * so the main bundle stays small.
 */
export async function readExifFromUrl(url: string, filename: string): Promise<ExifSnapshot | null> {
  if (isRawFilename(filename)) return null;
  try {
    const exifr = (await import('exifr')).default;
    const tags = await exifr.parse(url, {
      pick: ['DateTimeOriginal', 'ExposureBiasValue'],
    });
    if (!tags) return null;
    const takenAt = tags.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal.getTime() : null;
    const exposureBias =
      typeof tags.ExposureBiasValue === 'number' ? tags.ExposureBiasValue : null;
    return { takenAt, exposureBias };
  } catch {
    return null;
  }
}

/**
 * Promote singles to brackets when their EXIF metadata says they belong
 * together: same takenAt window AND at least 3 of them have distinct
 * exposureBias values. Mutates the result in place and returns it.
 */
export function applyExifGrouping(
  result: GroupingResult,
  exif: Record<string, ExifSnapshot>
): GroupingResult {
  if (result.singles.length < 3) return result;

  // Bucket singles by their takenAt rounded to the time window so candidates
  // for the same bracket land in the same bucket.
  const buckets = new Map<number, Photo[]>();
  const orphans: Photo[] = [];
  for (const p of result.singles) {
    const snap = exif[p.id];
    if (!snap?.takenAt) {
      orphans.push(p);
      continue;
    }
    const bucket = Math.floor(snap.takenAt / EXIF_TIME_WINDOW_MS);
    const arr = buckets.get(bucket) ?? [];
    arr.push(p);
    buckets.set(bucket, arr);
  }

  const newBrackets: BracketGroup[] = [];
  const newSingles: Photo[] = [...orphans];

  for (const [, group] of buckets) {
    // Distinct exposure biases is the bracket signature.
    const biases = new Set(
      group
        .map((p) => exif[p.id]?.exposureBias)
        .filter((b): b is number => typeof b === 'number')
    );
    const isBracket =
      BRACKET_SIZES.includes(group.length as 3 | 5 | 7) &&
      biases.size >= Math.min(3, group.length);
    if (isBracket) {
      // Sort by exposure bias ascending — darkest first, matches our convention.
      group.sort(
        (a, b) => (exif[a.id]?.exposureBias ?? 0) - (exif[b.id]?.exposureBias ?? 0)
      );
      newBrackets.push({
        id: `bracket-exif-${group[0].id}`,
        photos: group,
        detectedSize: group.length as 3 | 5 | 7,
      });
    } else {
      newSingles.push(...group);
    }
  }

  return {
    brackets: [...result.brackets, ...newBrackets],
    singles: newSingles,
  };
}
