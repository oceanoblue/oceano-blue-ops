import type { ColorStats } from './color-stats';

/**
 * Set-level color-consistency analysis. Given the per-photo white-balance cast,
 * find the set's center (median a*, b*, L) and flag photos that drift from it —
 * the "one room looks warmer/cooler/greener/darker than the rest" problem.
 *
 * Thresholds are in CIELAB units, tuned so only differences a person would
 * notice across a gallery are flagged (small, expected variation is ignored).
 */
export interface PhotoStat {
  photo_id: string;
  filename: string;
  stats: ColorStats;
}

export type ConsistencyFlagKind = 'warm' | 'cool' | 'green' | 'magenta' | 'bright' | 'dark';

export interface ConsistencyFinding {
  photo_id: string;
  filename: string;
  deltaA: number; // signed, vs set median
  deltaB: number;
  deltaL: number;
  flags: ConsistencyFlagKind[];
}

export interface ConsistencyReport {
  median: { a: number; b: number; L: number };
  /** 0–100; 100 = perfectly consistent white balance across the set. */
  score: number;
  findings: ConsistencyFinding[]; // only photos with at least one flag
  evaluated: number;
}

/** Per-photo flag thresholds (CIELAB units), measured vs the set median. */
export interface ConsistencyThresholds {
  /** warm/cool — the dominant WB axis (b*). */
  b: number;
  /** green/magenta (a*). */
  a: number;
  /** brightness outlier (L). */
  L: number;
}

/** Default thresholds = the MLS look: only flag a difference a person would
 *  notice across a gallery. Stricter profiles tighten these (see qc rulesets). */
export const DEFAULT_CONSISTENCY_THRESHOLDS: ConsistencyThresholds = {
  b: 6,
  a: 5,
  L: 12,
};

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function analyzeConsistency(
  items: PhotoStat[],
  thresholds: ConsistencyThresholds = DEFAULT_CONSISTENCY_THRESHOLDS
): ConsistencyReport {
  const mA = median(items.map((i) => i.stats.a));
  const mB = median(items.map((i) => i.stats.b));
  const mL = median(items.map((i) => i.stats.L));

  const findings: ConsistencyFinding[] = [];
  for (const it of items) {
    const deltaA = it.stats.a - mA;
    const deltaB = it.stats.b - mB;
    const deltaL = it.stats.L - mL;
    const flags: ConsistencyFlagKind[] = [];
    if (deltaB > thresholds.b) flags.push('warm');
    else if (deltaB < -thresholds.b) flags.push('cool');
    if (deltaA > thresholds.a) flags.push('magenta');
    else if (deltaA < -thresholds.a) flags.push('green');
    if (deltaL > thresholds.L) flags.push('bright');
    else if (deltaL < -thresholds.L) flags.push('dark');
    if (flags.length) {
      findings.push({
        photo_id: it.photo_id,
        filename: it.filename,
        deltaA: round(deltaA),
        deltaB: round(deltaB),
        deltaL: round(deltaL),
        flags,
      });
    }
  }

  // Score from the spread of the warm/cool axis (the one clients notice most):
  // mean absolute deviation of b* mapped to 0–100.
  const madB = items.length
    ? items.reduce((s, i) => s + Math.abs(i.stats.b - mB), 0) / items.length
    : 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - madB * 9)));

  return {
    median: { a: round(mA), b: round(mB), L: round(mL) },
    score,
    findings,
    evaluated: items.length,
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

const KIND_LABEL: Record<ConsistencyFlagKind, string> = {
  warm: 'runs warm',
  cool: 'runs cool',
  green: 'green tint',
  magenta: 'magenta tint',
  bright: 'brighter than set',
  dark: 'darker than set',
};

export function describeFlags(flags: ConsistencyFlagKind[]): string {
  return flags.map((f) => KIND_LABEL[f]).join(', ');
}

/**
 * Build a correction directive (editor note) for a flagged photo, used when
 * re-enhancing it back into line with the set.
 */
export function correctionDirective(f: ConsistencyFinding): string {
  const parts: string[] = [];
  if (f.flags.includes('warm'))
    parts.push('This frame reads too warm/yellow versus the rest of the set — cool the white balance toward a clean neutral daylight so ceilings, trim and walls read true-white.');
  if (f.flags.includes('cool'))
    parts.push('This frame reads too cool/blue versus the rest of the set — warm the white balance slightly toward a neutral, inviting daylight to match the others.');
  if (f.flags.includes('green'))
    parts.push('Remove a green color cast; bring neutrals back to true-neutral.');
  if (f.flags.includes('magenta'))
    parts.push('Remove a magenta/pink color cast; bring neutrals back to true-neutral.');
  if (f.flags.includes('bright'))
    parts.push('This frame is brighter than the set — bring overall exposure down to match the others.');
  if (f.flags.includes('dark'))
    parts.push('This frame is darker than the set — lift overall exposure to match the others.');
  parts.push('Keep the property exactly as-is — do not change wall, cabinetry, or material colors; only correct white balance/exposure for consistency.');
  return parts.join(' ');
}
