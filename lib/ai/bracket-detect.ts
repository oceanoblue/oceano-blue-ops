import type { Photo } from '@/lib/supabase/database.types';

/**
 * Detect bracketed HDR sets from a batch of uploaded photos.
 *
 * Strategy:
 *  1. Sort by capture timestamp from EXIF (fallback: filename).
 *  2. Group adjacent photos that:
 *     - were captured within `windowMs` of each other
 *     - share the same camera body + lens + focal length
 *     - have distinct exposure_bias values
 *  3. A group of 3, 5, or 7 with monotonically increasing/decreasing exposure
 *     bias is treated as a bracket.
 *
 * This runs purely on already-stored Photo rows; no file I/O.
 */
export interface BracketDetectOptions {
  windowMs?: number;
  minSize?: number;
  maxSize?: number;
  /** Propose same-bias shutter brackets for human review; automatic jobs leave this off. */
  allowShutterFallback?: boolean;
}

interface ExifLike {
  DateTimeOriginal?: string;
  ExposureBiasValue?: number | string;
  Model?: string;
  LensModel?: string;
  FocalLength?: number | string;
}

function ts(p: Photo): number {
  const e = (p.exif ?? {}) as ExifLike;
  if (e.DateTimeOriginal) {
    // EXIF is "YYYY:MM:DD HH:MM:SS"
    const iso = e.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const t = Date.parse(iso);
    if (!isNaN(t)) return t;
  }
  return Date.parse(p.created_at);
}

function bias(p: Photo): number {
  const e = (p.exif ?? {}) as ExifLike;
  const v = e.ExposureBiasValue;
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  // EXIF often stores as "1/3" or "-2/1"
  const m = String(v).match(/(-?\d+)(?:\/(\d+))?/);
  if (!m) return 0;
  return Number(m[1]) / (m[2] ? Number(m[2]) : 1);
}

function signature(p: Photo): string {
  const e = (p.exif ?? {}) as ExifLike;
  return [e.Model ?? '', e.LensModel ?? '', e.FocalLength ?? ''].join('|');
}

function positiveNumber(value: unknown): number | null {
  const match = typeof value === 'string' ? value.trim().match(/^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/) : null;
  const n = typeof value === 'number' ? value : match ? Number(match[1]) / Number(match[2] ?? 1) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Seconds, including rational strings from imported EXIF. */
export function exposureTimeOf(photo: Pick<Photo, 'exif'>): number | null {
  return positiveNumber((photo.exif as Record<string, unknown> | null)?.ExposureTime);
}

/** Conservative exposure-settings evidence, for reviewed proposals only.
 * Requires real capture times, a known rig, fixed aperture/ISO, equal stated
 * bias, and evenly spaced shutter stops. File names/upload times are no evidence.
 */
export function isShutterBracket(photos: Pick<Photo, 'exif'>[], windowMs = 4000): boolean {
  if (![3, 5, 7].includes(photos.length)) return false;
  const tags = photos.map(p => (p.exif ?? {}) as Record<string, unknown>);
  const first = tags[0];
  if (typeof first.Model !== 'string' || !first.Model.trim() ||
      typeof first.LensModel !== 'string' || !first.LensModel.trim()) return false;
  const required = ['FocalLength', 'FNumber', 'ISO'] as const;
  if (required.some(k => positiveNumber(first[k]) === null)) return false;
  const times = tags.map(e => typeof e.DateTimeOriginal === 'string'
    ? Date.parse(e.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')) : NaN);
  if (times.some(t => !Number.isFinite(t)) || Math.max(...times) - Math.min(...times) > windowMs) return false;
  if (typeof first.ExposureBiasValue !== 'number' || !Number.isFinite(first.ExposureBiasValue)) return false;
  if (tags.some(e => e.Model !== first.Model || e.LensModel !== first.LensModel ||
      e.ExposureBiasValue !== first.ExposureBiasValue ||
      required.some(k => positiveNumber(e[k]) !== positiveNumber(first[k])) ||
      (typeof e.Flash === 'number' && (e.Flash & 1) !== 0))) return false;
  const shutters = tags.map(e => positiveNumber(e.ExposureTime));
  if (shutters.some(t => t === null)) return false;
  const stops = (shutters as number[]).map(Math.log2).sort((a, b) => a - b);
  const steps = stops.slice(1).map((v, i) => v - stops[i]);
  return steps.every(step => step >= 0.75 && step <= 4) && Math.max(...steps) - Math.min(...steps) <= 0.35;
}

export function detectBrackets(
  photos: Photo[],
  opts: BracketDetectOptions = {}
): Map<string, string[]> {
  const windowMs = opts.windowMs ?? 4000;
  const minSize = opts.minSize ?? 3;
  const maxSize = opts.maxSize ?? 9;

  const sorted = [...photos].sort((a, b) => ts(a) - ts(b));
  const groups = new Map<string, string[]>();

  let current: Photo[] = [];
  const flush = () => {
    if (current.length >= minSize && current.length <= maxSize) {
      const biases = current.map(bias);
      const unique = new Set(biases);
      if (unique.size === current.length || (opts.allowShutterFallback && isShutterBracket(current, windowMs))) {
        const id = crypto.randomUUID();
        groups.set(
          id,
          current.map((p) => p.id)
        );
      }
    }
    current = [];
  };

  for (const p of sorted) {
    if (current.length === 0) {
      current = [p];
      continue;
    }
    const prev = current[current.length - 1];
    const sameRig = signature(prev) === signature(p);
    const closeInTime = ts(p) - ts(prev) < windowMs;
    if (sameRig && closeInTime) {
      current.push(p);
    } else {
      flush();
      current = [p];
    }
  }
  flush();

  return groups;
}
