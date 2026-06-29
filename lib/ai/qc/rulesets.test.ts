import { describe, it, expect } from 'vitest';
import { QC_RULESETS, rulesetFor, evaluateVerdict } from './rulesets';
import type { ConsistencyReport } from './consistency';
import { DEFAULT_CONSISTENCY_THRESHOLDS } from './consistency';

function report(over: Partial<ConsistencyReport> = {}): ConsistencyReport {
  return {
    median: { a: 0, b: 2, L: 70 },
    score: 95,
    findings: [],
    evaluated: 10,
    ...over,
  };
}

describe('rulesetFor', () => {
  it('resolves each profile and falls back to MLS for unknown/empty', () => {
    expect(rulesetFor('architectural')).toBe(QC_RULESETS.architectural);
    expect(rulesetFor('interior_design')).toBe(QC_RULESETS.interior_design);
    expect(rulesetFor(null)).toBe(QC_RULESETS.mls_real_estate);
    expect(rulesetFor('nonsense')).toBe(QC_RULESETS.mls_real_estate);
  });

  it('MLS deltas equal the default consistency thresholds (no behaviour change)', () => {
    expect(QC_RULESETS.mls_real_estate.deltas).toEqual(DEFAULT_CONSISTENCY_THRESHOLDS);
  });

  it('bars get stricter from MLS → luxury → architectural', () => {
    expect(QC_RULESETS.luxury_real_estate.minScore).toBeGreaterThan(QC_RULESETS.mls_real_estate.minScore);
    expect(QC_RULESETS.architectural.minScore).toBeGreaterThan(QC_RULESETS.luxury_real_estate.minScore);
    expect(QC_RULESETS.architectural.deltas.b).toBeLessThan(QC_RULESETS.mls_real_estate.deltas.b);
  });
});

describe('evaluateVerdict', () => {
  const clean = { flaggedCount: 0, total: 10, aiRan: true, wallDrift: 0 };

  it('passes a clean, neutral set', () => {
    const v = evaluateVerdict({ ruleset: QC_RULESETS.architectural, report: report(), ...clean });
    expect(v.pass).toBe(true);
    expect(v.reasons).toHaveLength(0);
    expect(v.castFlags).toHaveLength(0);
  });

  it('fails when the score is below the profile bar', () => {
    const v = evaluateVerdict({
      ruleset: QC_RULESETS.architectural, // minScore 85
      report: report({ score: 80 }),
      ...clean,
    });
    expect(v.pass).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/below the 85 bar/);
  });

  it('fails when too much of the set drifts', () => {
    const v = evaluateVerdict({
      ruleset: QC_RULESETS.mls_real_estate, // maxFlaggedRatio 0.25
      report: report(),
      flaggedCount: 4,
      total: 10, // 40% > 25%
      aiRan: true,
      wallDrift: 0,
    });
    expect(v.pass).toBe(false);
    expect(v.flaggedRatio).toBe(0.4);
    expect(v.reasons.join(' ')).toMatch(/drift from the set/);
  });

  it('judges the same warm white point differently per profile', () => {
    const warm = report({ median: { a: 0, b: 7, L: 70 } });
    // MLS allows warmth up to b*=8 → no cast flag.
    const mls = evaluateVerdict({ ruleset: QC_RULESETS.mls_real_estate, report: warm, ...clean });
    expect(mls.castFlags).not.toContain('warm');
    expect(mls.pass).toBe(true);
    // Architectural caps warmth at b*=3 → flagged warm and failed.
    const arch = evaluateVerdict({ ruleset: QC_RULESETS.architectural, report: warm, ...clean });
    expect(arch.castFlags).toContain('warm');
    expect(arch.pass).toBe(false);
  });

  it('flags a green set cast', () => {
    const green = report({ median: { a: -4, b: 1, L: 70 } });
    const v = evaluateVerdict({ ruleset: QC_RULESETS.interior_design, report: green, ...clean });
    expect(v.castFlags).toContain('green');
    expect(v.pass).toBe(false);
  });

  it('fails on AI wall drift only when the profile requires fidelity', () => {
    const drift = { flaggedCount: 0, total: 10, aiRan: true, wallDrift: 2 };
    const arch = evaluateVerdict({ ruleset: QC_RULESETS.architectural, report: report(), ...drift });
    expect(arch.pass).toBe(false);
    expect(arch.reasons.join(' ')).toMatch(/material\/wall-colour drift on 2/);
    // MLS doesn't require fidelity → wall drift doesn't fail it.
    const mls = evaluateVerdict({ ruleset: QC_RULESETS.mls_real_estate, report: report(), ...drift });
    expect(mls.pass).toBe(true);
  });

  it('marks fidelity unverified (but still passes) when AI did not run', () => {
    const v = evaluateVerdict({
      ruleset: QC_RULESETS.architectural,
      report: report(),
      flaggedCount: 0,
      total: 10,
      aiRan: false, // no API key
      wallDrift: 0,
    });
    expect(v.fidelityUnverified).toBe(true);
    expect(v.pass).toBe(true); // can't gate on a check that didn't run
  });

  it('handles an empty set without dividing by zero', () => {
    const v = evaluateVerdict({
      ruleset: QC_RULESETS.mls_real_estate,
      report: report({ evaluated: 0 }),
      flaggedCount: 0,
      total: 0,
      aiRan: false,
      wallDrift: 0,
    });
    expect(v.flaggedRatio).toBe(0);
    expect(v.pass).toBe(true);
  });
});
