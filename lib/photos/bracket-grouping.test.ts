import { describe, it, expect } from 'vitest';
import { groupPhotosIntoBrackets } from './bracket-grouping';
import type { Photo } from '@/lib/supabase/database.types';

/** Minimal Photo factory — only the fields the grouper reads. */
function seq(base: string, from: number, to: number, ext = 'ARW'): Photo[] {
  const out: Photo[] = [];
  for (let n = from; n <= to; n++) {
    const num = String(n).padStart(5, '0');
    out.push({ id: `${base}${num}`, filename: `${base}${num}.${ext}` } as Photo);
  }
  return out;
}

const ids = (photos: Photo[]) => photos.map((p) => p.id);

describe('groupPhotosIntoBrackets — auto', () => {
  it('splits 6 consecutive frames into two 3-shots (the 3+3 bug)', () => {
    // OBM09520..09525 — previously grabbed as one 5-shot + 1 single.
    const { brackets, singles } = groupPhotosIntoBrackets(seq('OBM', 9520, 9525));
    expect(brackets).toHaveLength(2);
    expect(brackets.every((b) => b.detectedSize === 3)).toBe(true);
    expect(singles).toHaveLength(0);
    expect(ids(brackets[0].photos)).toEqual(['OBM09520', 'OBM09521', 'OBM09522']);
    expect(ids(brackets[1].photos)).toEqual(['OBM09523', 'OBM09524', 'OBM09525']);
  });

  it('keeps a clean 5-shot as a single 5-bracket', () => {
    const { brackets, singles } = groupPhotosIntoBrackets(seq('OBM', 100, 104));
    expect(brackets).toHaveLength(1);
    expect(brackets[0].detectedSize).toBe(5);
    expect(singles).toHaveLength(0);
  });

  it('keeps a clean 7-shot as a single 7-bracket', () => {
    const { brackets } = groupPhotosIntoBrackets(seq('OBM', 200, 206));
    expect(brackets).toHaveLength(1);
    expect(brackets[0].detectedSize).toBe(7);
  });

  it('splits 10 consecutive into two 5-shots', () => {
    const { brackets, singles } = groupPhotosIntoBrackets(seq('OBM', 300, 309));
    expect(brackets).toHaveLength(2);
    expect(brackets.every((b) => b.detectedSize === 5)).toBe(true);
    expect(singles).toHaveLength(0);
  });

  it('leaves a non-bracket remainder as singles (4 → 3 + 1)', () => {
    const { brackets, singles } = groupPhotosIntoBrackets(seq('OBM', 400, 403));
    expect(brackets).toHaveLength(1);
    expect(brackets[0].detectedSize).toBe(3);
    expect(ids(singles)).toEqual(['OBM00403']);
  });

  it('does not bridge a numbering gap between runs', () => {
    // 500,501,502 then a gap then 510,511,512 → two separate 3-shots.
    const { brackets } = groupPhotosIntoBrackets([...seq('OBM', 500, 502), ...seq('OBM', 510, 512)]);
    expect(brackets).toHaveLength(2);
    expect(ids(brackets[0].photos)).toEqual(['OBM00500', 'OBM00501', 'OBM00502']);
    expect(ids(brackets[1].photos)).toEqual(['OBM00510', 'OBM00511', 'OBM00512']);
  });
});

describe('groupPhotosIntoBrackets — fixed Count', () => {
  it('forces 3-shot grouping over a 6-run', () => {
    const { brackets } = groupPhotosIntoBrackets(seq('OBM', 9520, 9525), { fixedSize: 3 });
    expect(brackets).toHaveLength(2);
    expect(brackets.every((b) => b.detectedSize === 3)).toBe(true);
  });

  it('forces 5-shot and pushes the remainder to singles (6 → 5 + 1)', () => {
    const { brackets, singles } = groupPhotosIntoBrackets(seq('OBM', 9520, 9525), { fixedSize: 5 });
    expect(brackets).toHaveLength(1);
    expect(brackets[0].detectedSize).toBe(5);
    expect(ids(singles)).toEqual(['OBM09525']);
  });
});
