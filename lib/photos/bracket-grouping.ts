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
