import type { Photo } from '@/lib/supabase/database.types';
import { groupPhotosIntoBrackets } from './bracket-grouping';
import { detectBrackets } from '@/lib/ai/bracket-detect';

/**
 * Real estate bracket detection over Production OS `assets` rows.
 *
 * This deliberately REUSES the two existing detectors instead of
 * reimplementing them:
 *
 *  - `groupPhotosIntoBrackets` (lib/photos/bracket-grouping.ts) — filename
 *    sequence runs of 3/5/7. Fast and ~95% correct for photographer uploads.
 *  - `detectBrackets` (lib/ai/bracket-detect.ts) — EXIF signature: capture
 *    timestamp window + same camera/lens/focal length + distinct exposure
 *    bias values.
 *
 * Both functions read only `id`, `filename`, `exif`, `created_at` (and
 * `byte_size`) — all present on `assets` — so we pass asset rows through with a
 * structural cast. We then reconcile the two results into a single set of
 * groups, each with a confidence score and a `review_required` flag:
 *
 *   filename run CONFIRMED by EXIF brackets   → 0.97  (no review)
 *   filename run, no EXIF available to confirm → 0.82  (no review)
 *   filename run, EXIF present but disagrees   → 0.60  (review)
 *   EXIF-only group (filenames not sequential) → 0.65  (review)
 *
 * Groups below REVIEW_THRESHOLD (0.80) are flagged for human review — this is
 * the core of the "Real Estate Photo Rescue" fix. The threshold sits below the
 * filename-only score (0.82, reliable) and above the uncertain scores (≤0.65).
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

function hasUsableExif(asset: AssetLike): boolean {
  const e = asset.exif as ExifLike | null | undefined;
  return !!e && (e.DateTimeOriginal != null || e.ExposureBiasValue != null);
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

  // Reuse the two existing detectors. They only touch fields assets also have.
  const fn = groupPhotosIntoBrackets(assets as unknown as Photo[]);
  const exifGroups = [...detectBrackets(assets as unknown as Photo[]).values()];
  const exifSets = exifGroups.map((ids) => new Set(ids));

  const exactExif = (members: string[]) => {
    const ms = new Set(members);
    return exifSets.some((s) => s.size === ms.size && [...ms].every((id) => s.has(id)));
  };

  const used = new Set<string>();
  const groups: DetectedGroup[] = [];

  // 1) Filename-sequence brackets (highest signal), confirmed or not by EXIF.
  for (const b of fn.brackets) {
    const members = b.photos.map((p) => p.id);
    members.forEach((id) => used.add(id));
    const anyExif = members.some((id) => hasUsableExif(byId.get(id)!));

    if (anyExif && exactExif(members)) {
      groups.push(
        makeGroup(members, byId, 0.97, 'filename+exif', 'Sequential filenames confirmed by EXIF exposure bracket.')
      );
    } else if (anyExif) {
      groups.push(
        makeGroup(members, byId, 0.6, 'filename', 'Sequential filenames, but EXIF does not confirm a matching bracket — please verify.')
      );
    } else {
      groups.push(
        makeGroup(members, byId, 0.82, 'filename', 'Sequential filenames (no EXIF available to confirm).')
      );
    }
  }

  // 2) EXIF-only groups recovered from photos the filename pass left as singles.
  for (const ids of exifGroups) {
    if (ids.length < 3) continue;
    if (ids.some((id) => used.has(id))) continue; // overlaps a filename bracket
    ids.forEach((id) => used.add(id));
    groups.push(
      makeGroup(ids, byId, 0.65, 'exif', 'Grouped only by EXIF timestamp + exposure bias; filenames are not sequential — please verify.')
    );
  }

  const singleAssetIds = assets.map((a) => a.id).filter((id) => !used.has(id));
  return { groups, singleAssetIds };
}
