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

/** Split a sorted array into maximal runs of consecutive (same-base, +1) frames. */
function consecutiveRuns(sorted: Photo[]): Photo[][] {
  const runs: Photo[][] = [];
  let run: Photo[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (run.length === 0) {
      run = [sorted[i]];
      continue;
    }
    const prev = parseSequence(sorted[i - 1].filename);
    const cur = parseSequence(sorted[i].filename);
    if (prev && cur && cur.base === prev.base && cur.num === prev.num + 1) {
      run.push(sorted[i]);
    } else {
      runs.push(run);
      run = [sorted[i]];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Pick the bracket size to chunk a run of `len` consecutive frames by.
 * Prefer a size that divides the run evenly (so 6 → 3+3, 10 → 5+5, 14 → 7+7),
 * smallest-first since 3-shot AEB is the real-estate default. Falls back to the
 * largest size that fits when nothing divides evenly (e.g. 4 → 3 + 1 single).
 */
function pickAutoSize(len: number): 0 | 3 | 5 | 7 {
  for (const s of BRACKET_SIZES) if (len % s === 0) return s;
  for (const s of [7, 5, 3] as const) if (len >= s) return s;
  return 0;
}

export interface GroupingOptions {
  /**
   * Force a fixed bracket size (the "Count" bracketing method). When set, every
   * consecutive run is chunked into groups of exactly this many frames; any
   * remainder becomes singles. When omitted, sizes are auto-detected per run.
   */
  fixedSize?: 3 | 5 | 7;
}

/** Sort photos by (filename base, sequence number). */
function sortBySequence(photos: Photo[]): Photo[] {
  return [...photos]
    .map((p) => ({ photo: p, seq: parseSequence(p.filename) }))
    .sort((a, b) => {
      if (!a.seq || !b.seq) return a.photo.filename.localeCompare(b.photo.filename);
      if (a.seq.base !== b.seq.base) return a.seq.base.localeCompare(b.seq.base);
      return a.seq.num - b.seq.num;
    })
    .map((s) => s.photo);
}

/** Chunk one consecutive run into brackets/singles by count (filename heuristic). */
function chunkRunByFilename(
  run: Photo[],
  fixedSize: 3 | 5 | 7 | undefined,
  brackets: BracketGroup[],
  singles: Photo[]
): void {
  let j = 0;
  while (j < run.length) {
    const remaining = run.length - j;
    const size: 0 | 3 | 5 | 7 = fixedSize
      ? remaining >= fixedSize
        ? fixedSize
        : 0
      : pickAutoSize(remaining);
    if (size !== 0) {
      brackets.push({ id: `bracket-${run[j].id}`, photos: run.slice(j, j + size), detectedSize: size });
      j += size;
    } else {
      singles.push(run[j]);
      j++;
    }
  }
}

export function groupPhotosIntoBrackets(
  photos: Photo[],
  opts?: GroupingOptions
): GroupingResult {
  const sorted = sortBySequence(photos);
  const brackets: BracketGroup[] = [];
  const singles: Photo[] = [];
  // Process each maximal consecutive run independently so a run of N frames is
  // split into uniform brackets (3+3) instead of a greedy largest-run grab
  // (5+1). A fixed Count overrides the per-run heuristic entirely.
  for (const run of consecutiveRuns(sorted)) {
    chunkRunByFilename(run, opts?.fixedSize, brackets, singles);
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

// ─── EXIF exposure-bias validation ────────────────────────────────────────
// The filename pass groups by consecutive numbering, which can absorb an
// in-sequence detail single when the combined run happens to be a valid bracket
// size (e.g. 3 + 1 + 3 = 7 consecutive numbers read as one 7-shot bracket).
// This validator re-segments each detected bracket by the actual exposure-bias
// cycle: a bracket repeats its EV set, and a detail single (a lone, normally-
// metered exposure) shows up as a duplicate EV that breaks the cycle. Frames
// that fall out become singles.
//
// It is deliberately conservative — it only overrides the filename grouping when
// EXIF is present for EVERY frame AND the re-segmentation is clean (every piece
// is a lone single or a distinct-EV 3/5/7 bracket). Otherwise the original
// bracket is kept, so it can never make grouping worse.

// Brackets fire in a sub-second burst; a detail single is a separate press with
// a real pause around it. A capture-time gap larger than this starts a new group.
const BURST_GAP_MS = 1500;

/** Split a group into sub-runs wherever the exposure-bias value repeats. */
function splitByEvCycle(photos: Photo[], exif: Record<string, ExifSnapshot>): Photo[][] {
  const groups: Photo[][] = [];
  let cur: Photo[] = [];
  let seen = new Set<number>();
  for (const p of photos) {
    const ev = exif[p.id]?.exposureBias;
    if (typeof ev === 'number' && seen.has(ev)) {
      groups.push(cur);
      cur = [p];
      seen = new Set([ev]);
    } else {
      cur.push(p);
      if (typeof ev === 'number') seen.add(ev);
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * Segment a run into brackets + singles using capture time and exposure bias.
 * Primary signal is the burst time-gap (cleanly isolates detail singles); within
 * each burst, the exposure-bias cycle separates back-to-back brackets and catches
 * a rapid in-burst single. Returns null when there isn't enough EXIF to be sure
 * (no timestamps and no exposure bias) or when a piece isn't a clean single /
 * distinct-EV 3·5·7 bracket — so callers fall back rather than guess.
 */
function segmentByExifCycle(
  photos: Photo[],
  exif: Record<string, ExifSnapshot>
): Photo[][] | null {
  const haveAllEv = photos.every((p) => typeof exif[p.id]?.exposureBias === 'number');
  const haveAllTs = photos.every((p) => typeof exif[p.id]?.takenAt === 'number');
  if (!haveAllEv && !haveAllTs) return null;

  // 1) Cluster by capture-time gaps (a clear single shows up as its own cluster).
  let clusters: Photo[][];
  if (haveAllTs) {
    clusters = [];
    let cur: Photo[] = [];
    for (let i = 0; i < photos.length; i++) {
      if (i > 0) {
        const gap = (exif[photos[i].id]!.takenAt as number) - (exif[photos[i - 1].id]!.takenAt as number);
        if (gap > BURST_GAP_MS) {
          clusters.push(cur);
          cur = [];
        }
      }
      cur.push(photos[i]);
    }
    if (cur.length) clusters.push(cur);
  } else {
    clusters = [photos];
  }

  // 2) Within each burst, split by the exposure-bias cycle when EV is available.
  const groups: Photo[][] = [];
  for (const c of clusters) {
    if (haveAllEv) groups.push(...splitByEvCycle(c, exif));
    else groups.push(c);
  }

  // 3) Every piece must be a lone single or a distinct-EV 3·5·7 bracket.
  for (const g of groups) {
    if (g.length === 1) continue;
    if (!BRACKET_SIZES.includes(g.length as 3 | 5 | 7)) return null;
    if (haveAllEv) {
      const distinct = new Set(g.map((p) => exif[p.id]?.exposureBias));
      if (distinct.size !== g.length) return null;
    }
  }
  return groups;
}

/**
 * Primary EXIF-aware grouping. Splits photos into consecutive filename runs,
 * then for each run whose frames ALL have an exposure bias, segments the run by
 * the exposure-bias cycle (correctly separating brackets from interspersed
 * detail singles even when everything was shot in one continuous numbering
 * sequence). Runs without complete EXIF fall back to the filename count
 * heuristic. This is the robust path for mixed bracket + single sessions.
 */
export function groupWithExif(
  photos: Photo[],
  exif: Record<string, ExifSnapshot>
): GroupingResult {
  const sorted = sortBySequence(photos);
  const brackets: BracketGroup[] = [];
  const singles: Photo[] = [];

  for (const run of consecutiveRuns(sorted)) {
    const groups = segmentByExifCycle(run, exif);
    if (groups) {
      for (const g of groups) {
        if (g.length === 1) {
          singles.push(g[0]);
        } else {
          const s = [...g].sort(
            (a, b) => (exif[a.id]?.exposureBias ?? 0) - (exif[b.id]?.exposureBias ?? 0)
          );
          brackets.push({ id: `bracket-${s[0].id}`, photos: s, detectedSize: g.length as 3 | 5 | 7 });
        }
      }
    } else {
      chunkRunByFilename(run, undefined, brackets, singles);
    }
  }

  return { brackets, singles };
}

/**
 * Validate filename-detected brackets against EXIF exposure bias and split out
 * any in-sequence singles the filename pass absorbed. Only adopts the EXIF
 * segmentation when it cleanly splits a bracket into multiple pieces; otherwise
 * the original bracket is preserved.
 */
export function validateBracketsWithExif(
  result: GroupingResult,
  exif: Record<string, ExifSnapshot>
): GroupingResult {
  const brackets: BracketGroup[] = [];
  const singles: Photo[] = [...result.singles];

  for (const b of result.brackets) {
    const groups = segmentByExifCycle(b.photos, exif);
    if (groups && groups.length > 1) {
      for (const g of groups) {
        if (g.length === 1) {
          singles.push(g[0]);
        } else {
          // Keep darkest-first by exposure bias for downstream convention.
          const sorted = [...g].sort(
            (a, c) => (exif[a.id]?.exposureBias ?? 0) - (exif[c.id]?.exposureBias ?? 0)
          );
          brackets.push({
            id: `bracket-${sorted[0].id}`,
            photos: sorted,
            detectedSize: sorted.length as 3 | 5 | 7,
          });
        }
      }
    } else {
      brackets.push(b);
    }
  }

  return { brackets, singles };
}
