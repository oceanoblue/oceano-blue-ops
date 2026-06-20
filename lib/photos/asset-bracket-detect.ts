import type { Photo } from '@/lib/supabase/database.types';
import { groupWithExif, type ExifSnapshot } from './bracket-grouping';
import { detectBrackets } from '@/lib/ai/bracket-detect';

/**
 * Real estate bracket detection over Production OS `assets` rows.
 *
 * The Photo Rescue pipeline shares the SAME bracket-grouping engine as the
 * Orders pipeline (`groupWithExif` in lib/photos/bracket-grouping.ts), so the
 * two stay at parity: brackets and interspersed detail singles are separated
 * correctly even when shot in one continuous filename run, using the capture
 * time-gap (burst detection) plus the exposure-bias cycle. Falls back to the
 * filename count heuristic per run when EXIF is unavailable.
 *
 * On top of the grouping we attach a confidence score and a `review_required`
 * flag — the rescue-specific layer that lets a human verify uncertain groups:
 *
 *   filename run confirmed by distinct-EV EXIF → 0.95  (no review)
 *   filename run, no EXIF available to confirm → 0.82  (no review)
 *   filename run with partial/ambiguous EXIF   → 0.70  (review)
 *   EXIF-only group (filenames not sequential) → 0.65  (review)
 *
 * Groups below REVIEW_THRESHOLD (0.80) are flagged for human review. The
 * threshold sits below the filename-only score (0.82, reliable) and above the
 * uncertain scores (≤0.70). The EXIF-only recovery still uses `detectBrackets`
 * (a sliding capture-time window) over the frames the primary pass left as
 * singles, so renamed/interleaved sequences are still recovered.
 *
 * `groupWithExif`/`detectBrackets` read only `id`, `filename`, `exif`,
 * `created_at` — all present on `assets` — so we pass asset rows through with a
 * structural cast.
 */

export interface AssetLike {
  id: string;
  filename: string;
  byte_size?: number | null;
  created_at?: string;
  exif?: Record<string, unknown> | null;
}

export type BracketRole =
  | 'base_exposure'
  | 'flash'
  | 'ambient'
  | 'drone'
  | 'reject'
  | 'manual_review';

export type DetectionMethod = 'filename+exif' | 'filename' | 'exif';

export interface DetectedGroup {
  /** Asset ids ordered darkest → brightest where exposure bias is known. */
  assetIds: string[];
  size: number;
  confidence: number; // 0..1
  reviewRequired: boolean;
  method: DetectionMethod;
  /** Sparse map assetId → role; base_exposure is always assigned. */
  roles: Record<string, BracketRole>;
  reason: string;
}

export interface AssetDetectionResult {
  groups: DetectedGroup[];
  singleAssetIds: string[];
}

export const REVIEW_THRESHOLD = 0.8;

interface ExifLike {
  DateTimeOriginal?: unknown;
  ExposureBiasValue?: number | string;
  Model?: string;
  Make?: string;
}

/** Parse exposure bias from an asset's EXIF; null if unknown. */
function exposureBiasOf(asset: AssetLike): number | null {
  const v = (asset.exif as ExifLike | null | undefined)?.ExposureBiasValue;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const m = String(v).match(/(-?\d+)(?:\/(\d+))?/);
  if (!m) return null;
  return Number(m[1]) / (m[2] ? Number(m[2]) : 1);
}

/** Build the ExifSnapshot the canonical grouper expects from raw asset EXIF. */
function snapshotOf(asset: AssetLike): ExifSnapshot {
  const dto = (asset.exif as ExifLike | null | undefined)?.DateTimeOriginal;
  let takenAt: number | null = null;
  if (typeof dto === 'string') {
    // EXIF "YYYY:MM:DD HH:MM:SS" → ISO; an already-ISO string passes through.
    const iso = dto.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) takenAt = t;
  } else if (dto instanceof Date) {
    takenAt = dto.getTime();
  }
  return { takenAt, exposureBias: exposureBiasOf(asset) };
}

/** True if EXIF make/model looks like a drone (DJI etc.). */
export function looksLikeDrone(asset: AssetLike): boolean {
  const e = asset.exif as ExifLike | null | undefined;
  const hay = `${e?.Make ?? ''} ${e?.Model ?? ''}`.toLowerCase();
  return /dji|mavic|phantom|\bair\b|inspire|^fc\d/i.test(hay);
}

function makeGroup(
  ids: string[],
  byId: Map<string, AssetLike>,
  confidence: number,
  method: DetectionMethod,
  reason: string
): DetectedGroup {
  const members = ids.map((id) => byId.get(id)).filter((a): a is AssetLike => !!a);
  const biases = members.map((a) => ({ a, bias: exposureBiasOf(a) }));
  const allHaveBias = biases.every((b) => b.bias !== null);

  // Order darkest → brightest when we know the bias; otherwise keep input order
  // (which is already filename- or timestamp-sequential from the detectors).
  let ordered = ids;
  if (allHaveBias) {
    ordered = [...biases].sort((x, y) => (x.bias as number) - (y.bias as number)).map((b) => b.a.id);
  }

  // Base exposure = frame with bias closest to 0, else the middle frame.
  let baseId: string;
  if (allHaveBias) {
    baseId = biases.reduce((best, cur) =>
      Math.abs(cur.bias as number) < Math.abs(best.bias as number) ? cur : best
    ).a.id;
  } else {
    baseId = ordered[Math.floor(ordered.length / 2)];
  }

  return {
    assetIds: ordered,
    size: ordered.length,
    confidence,
    reviewRequired: confidence < REVIEW_THRESHOLD,
    method,
    roles: { [baseId]: 'base_exposure' },
    reason,
  };
}

export function detectAssetBracketGroups(assets: AssetLike[]): AssetDetectionResult {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const exif: Record<string, ExifSnapshot> = {};
  for (const a of assets) exif[a.id] = snapshotOf(a);

  // 1) Canonical EXIF-aware grouping (the SAME engine the Orders pipeline uses):
  //    consecutive filename runs, segmented by capture-time bursts + the
  //    exposure-bias cycle so an interspersed detail single is never absorbed
  //    into a neighbouring bracket. Runs without complete EXIF fall back to the
  //    filename count heuristic inside groupWithExif.
  const primary = groupWithExif(assets as unknown as Photo[], exif);

  const used = new Set<string>();
  const groups: DetectedGroup[] = [];

  for (const b of primary.brackets) {
    const ids = b.photos.map((p) => p.id);
    ids.forEach((id) => used.add(id));
    const members = ids.map((id) => byId.get(id)!);
    const biases = members.map((m) => exposureBiasOf(m)).filter((v): v is number => v !== null);
    const allBias = biases.length === members.length;
    const distinctBias = new Set(biases).size === biases.length;

    if (allBias && distinctBias) {
      groups.push(
        makeGroup(ids, byId, 0.95, 'filename+exif', 'Sequential filenames confirmed by EXIF exposure bracket (distinct bias per frame).')
      );
    } else if (biases.length === 0) {
      groups.push(
        makeGroup(ids, byId, 0.82, 'filename', 'Sequential filenames (no EXIF available to confirm).')
      );
    } else {
      groups.push(
        makeGroup(ids, byId, 0.7, 'filename', 'Sequential filenames with partial or ambiguous EXIF — please verify.')
      );
    }
  }

  // 2) EXIF-only recovery: brackets whose filenames are not sequential (renamed
  //    or interleaved from two bodies) get pulled out of the leftover singles by
  //    a sliding capture-time window + distinct exposure bias.
  const leftovers = primary.singles.map((p) => byId.get(p.id)!).filter(Boolean);
  for (const ids of detectBrackets(leftovers as unknown as Photo[]).values()) {
    if (ids.length < 3) continue;
    if (ids.some((id) => used.has(id))) continue;
    ids.forEach((id) => used.add(id));
    groups.push(
      makeGroup(ids, byId, 0.65, 'exif', 'Grouped only by EXIF timestamp + exposure bias; filenames are not sequential — please verify.')
    );
  }

  const singleAssetIds = assets.map((a) => a.id).filter((id) => !used.has(id));
  return { groups, singleAssetIds };
}
