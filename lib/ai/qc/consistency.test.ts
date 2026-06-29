import { describe, it, expect } from 'vitest';
import {
  analyzeConsistency,
  DEFAULT_CONSISTENCY_THRESHOLDS,
  type PhotoStat,
} from './consistency';

// Build a PhotoStat with just the axes the analysis reads (L, a, b); the rest
// of ColorStats is irrelevant here.
function stat(id: string, a: number, b: number, L = 70): PhotoStat {
  return {
    photo_id: id,
    filename: `${id}.jpg`,
    stats: { L, a, b, saturation: 0, neutralPixels: 100 },
  };
}

describe('analyzeConsistency', () => {
  it('a uniform set has no findings and a perfect score', () => {
    const items = [stat('a', 0, 2), stat('b', 0, 2), stat('c', 0, 2)];
    const r = analyzeConsistency(items);
    expect(r.findings).toHaveLength(0);
    expect(r.score).toBe(100);
    expect(r.median).toEqual({ a: 0, b: 2, L: 70 });
    expect(r.evaluated).toBe(3);
  });

  it('flags a warm outlier (b* well above the set median)', () => {
    const items = [stat('a', 0, 2), stat('b', 0, 2), stat('warm', 0, 12)];
    const r = analyzeConsistency(items);
    const f = r.findings.find((x) => x.photo_id === 'warm');
    expect(f?.flags).toContain('warm');
    // median b* is 2, the outlier is +10 → beyond the default b threshold (6).
    expect(f?.deltaB).toBeCloseTo(10, 1);
  });

  it('distinguishes cool / green / magenta / bright / dark', () => {
    const base = [stat('a', 0, 5, 70), stat('b', 0, 5, 70), stat('c', 0, 5, 70)];
    expect(
      analyzeConsistency([...base, stat('cool', 0, -5, 70)]).findings.at(-1)?.flags
    ).toContain('cool');
    expect(
      analyzeConsistency([...base, stat('green', -8, 5, 70)]).findings.at(-1)?.flags
    ).toContain('green');
    expect(
      analyzeConsistency([...base, stat('mag', 8, 5, 70)]).findings.at(-1)?.flags
    ).toContain('magenta');
    expect(
      analyzeConsistency([...base, stat('bright', 0, 5, 90)]).findings.at(-1)?.flags
    ).toContain('bright');
    expect(
      analyzeConsistency([...base, stat('dark', 0, 5, 50)]).findings.at(-1)?.flags
    ).toContain('dark');
  });

  it('stricter thresholds flag a borderline photo the default tolerates', () => {
    // +5 b* drift: under the default (6) it passes; a stricter profile (4) flags it.
    const items = [stat('a', 0, 0), stat('b', 0, 0), stat('edge', 0, 5)];
    expect(analyzeConsistency(items, DEFAULT_CONSISTENCY_THRESHOLDS).findings).toHaveLength(0);
    const strict = analyzeConsistency(items, { b: 4, a: 3, L: 9 });
    expect(strict.findings.map((f) => f.photo_id)).toContain('edge');
    expect(strict.findings[0].flags).toContain('warm');
  });

  it('score falls as the warm/cool spread widens', () => {
    const tight = analyzeConsistency([stat('a', 0, 1), stat('b', 0, 2), stat('c', 0, 3)]).score;
    const loose = analyzeConsistency([stat('a', 0, -8), stat('b', 0, 2), stat('c', 0, 12)]).score;
    expect(tight).toBeGreaterThan(loose);
  });

  it('is safe on an empty set', () => {
    const r = analyzeConsistency([]);
    expect(r.evaluated).toBe(0);
    expect(r.findings).toHaveLength(0);
    expect(r.score).toBe(100);
  });
});
