/**
 * Per-profile QC rulesets (Phase B).
 *
 * The SAME deterministic + AI checks run for every order; the production profile
 * (`orders.project_type` → `lib/photos/profiles.ts`) only changes the BAR they're
 * judged against. An MLS gallery wants "consistent enough, fast"; an
 * architectural set must read truly neutral and faithful. One pipeline, four
 * acceptance bars — never four code paths.
 *
 * A ruleset declares:
 *   - `deltas`     : per-photo consistency flag thresholds (fed to
 *                    analyzeConsistency) — stricter profiles flag tighter drift.
 *   - `cast`       : where the SET's overall white point should sit. This is the
 *                    profile "look" gate: architectural neutrals must be neutral,
 *                    MLS/luxury may carry a gentle, inviting warmth.
 *   - `minScore`   : minimum set consistency score (0–100) to pass.
 *   - `maxFlaggedRatio` : share of the set allowed to carry a flag before failing.
 *   - `requireFidelity` : whether AI material/wall-colour drift must be clean.
 *
 * Everything here is pure + deterministic (unit-tested in rulesets.test.ts).
 */
import type { ProjectType } from '@/lib/photos/profiles';
import { profileFor } from '@/lib/photos/profiles';
import type { ConsistencyReport, ConsistencyThresholds } from './consistency';

/** Where the set median white point may sit, per profile (CIELAB). */
export interface CastTarget {
  /** Allowed band for the warm/cool axis b* (negative = cool, positive = warm). */
  b: [number, number];
  /** Max absolute green/magenta a* before the set reads tinted. */
  aAbs: number;
}

export interface QcRuleset {
  /** Per-photo consistency flag thresholds (vs set median). */
  deltas: ConsistencyThresholds;
  /** Profile "look" gate for the set's overall white point. */
  cast: CastTarget;
  /** Minimum consistency score (0–100) to pass. */
  minScore: number;
  /** Fraction of the set allowed to carry a consistency flag before failing. */
  maxFlaggedRatio: number;
  /** Whether AI material-fidelity (wall/material colour drift) must be clean. */
  requireFidelity: boolean;
}

// Ordered loosest → strictest. MLS deltas intentionally equal
// DEFAULT_CONSISTENCY_THRESHOLDS so the default behaviour is unchanged.
export const QC_RULESETS: Record<ProjectType, QcRuleset> = {
  mls_real_estate: {
    deltas: { b: 6, a: 5, L: 12 },
    cast: { b: [-1, 8], aAbs: 3 }, // bright & inviting; gentle warmth welcome
    minScore: 70,
    maxFlaggedRatio: 0.25,
    requireFidelity: false, // speed over forensic fidelity for the MLS tier
  },
  luxury_real_estate: {
    deltas: { b: 5, a: 4, L: 10 },
    cast: { b: [-1, 6], aAbs: 2.5 },
    minScore: 80,
    maxFlaggedRatio: 0.15,
    requireFidelity: true,
  },
  architectural: {
    deltas: { b: 4, a: 3, L: 9 },
    cast: { b: [-2, 3], aAbs: 2 }, // truly neutral — documentary, not warm
    minScore: 85,
    maxFlaggedRatio: 0.12,
    requireFidelity: true,
  },
  interior_design: {
    deltas: { b: 4, a: 3, L: 10 },
    cast: { b: [-1, 4], aAbs: 2 }, // faithful colour & texture
    minScore: 83,
    maxFlaggedRatio: 0.12,
    requireFidelity: true,
  },
};

/** Resolve the ruleset for a raw `orders.project_type`, falling back to MLS. */
export function rulesetFor(projectType: string | null | undefined): QcRuleset {
  // profileFor already encodes the fallback; reuse its id so the two stay aligned.
  return QC_RULESETS[profileFor(projectType).id];
}

export interface QcVerdictInput {
  ruleset: QcRuleset;
  report: ConsistencyReport;
  /** Photos carrying at least one consistency flag. */
  flaggedCount: number;
  /** Photos evaluated for the verdict (the delivered set size). */
  total: number;
  /** Whether the AI fidelity pass actually ran (needs an API key). */
  aiRan: boolean;
  /** Photos the AI flagged for material/wall-colour drift. */
  wallDrift: number;
}

export interface QcVerdict {
  /** True when the set clears this profile's bar. */
  pass: boolean;
  score: number;
  minScore: number;
  /** Share of the set carrying a consistency flag (0–1, rounded to 0.01). */
  flaggedRatio: number;
  /** Set-level white-point issues for this profile, e.g. 'warm', 'green'. */
  castFlags: CastFlag[];
  /** Human-readable failure reasons (empty when pass). */
  reasons: string[];
  /** True when fidelity was required but the AI pass didn't run (advisory). */
  fidelityUnverified: boolean;
}

export type CastFlag = 'warm' | 'cool' | 'green' | 'magenta';

/**
 * Judge a finished set against its profile's bar. Pure: no I/O. The caller has
 * already measured the set (analyzeConsistency + the AI fidelity pass); this
 * turns those measurements into a pass/fail with reasons the ops UI can show.
 */
export function evaluateVerdict(input: QcVerdictInput): QcVerdict {
  const { ruleset, report, flaggedCount, total, aiRan, wallDrift } = input;
  const reasons: string[] = [];

  // 1. Set consistency score.
  if (report.score < ruleset.minScore) {
    reasons.push(`Consistency ${report.score} is below the ${ruleset.minScore} bar for this profile.`);
  }

  // 2. How much of the set drifts.
  const flaggedRatio = total > 0 ? flaggedCount / total : 0;
  if (flaggedRatio > ruleset.maxFlaggedRatio) {
    reasons.push(
      `${flaggedCount} of ${total} photos drift from the set (> ${Math.round(
        ruleset.maxFlaggedRatio * 100
      )}% allowed).`
    );
  }

  // 3. Profile "look": is the set's overall white point where it should be?
  const castFlags = castFlagsFor(report.median, ruleset.cast);
  for (const f of castFlags) reasons.push(CAST_REASON[f]);

  // 4. Material fidelity (only when the profile demands it).
  const fidelityUnverified = ruleset.requireFidelity && !aiRan;
  if (ruleset.requireFidelity && aiRan && wallDrift > 0) {
    reasons.push(
      `AI flagged material/wall-colour drift on ${wallDrift} photo${wallDrift === 1 ? '' : 's'}.`
    );
  }

  return {
    pass: reasons.length === 0,
    score: report.score,
    minScore: ruleset.minScore,
    flaggedRatio: Math.round(flaggedRatio * 100) / 100,
    castFlags,
    reasons,
    fidelityUnverified,
  };
}

const CAST_REASON: Record<CastFlag, string> = {
  warm: 'The set runs warm for this profile — cool the white balance toward neutral.',
  cool: 'The set runs cool for this profile — warm the white balance toward neutral.',
  green: 'The set carries a green cast — bring neutrals back to true-neutral.',
  magenta: 'The set carries a magenta cast — bring neutrals back to true-neutral.',
};

/** Set-level white-point issues: where the median sits vs the profile target. */
function castFlagsFor(median: { a: number; b: number }, cast: CastTarget): CastFlag[] {
  const flags: CastFlag[] = [];
  if (median.b > cast.b[1]) flags.push('warm');
  else if (median.b < cast.b[0]) flags.push('cool');
  if (median.a > cast.aAbs) flags.push('magenta');
  else if (median.a < -cast.aAbs) flags.push('green');
  return flags;
}
