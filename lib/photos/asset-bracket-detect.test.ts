import { describe, it, expect } from 'vitest';
import { detectAssetBracketGroups, looksLikeDrone, REVIEW_THRESHOLD, type AssetLike } from './asset-bracket-detect';

/** Build an asset with EXIF in the shapes the detectors expect. */
function asset(
  id: string,
  filename: string,
  opts: { time?: string; bias?: number; model?: string; lens?: string; focal?: number } = {}
): AssetLike {
  const exif: Record<string, unknown> = {};
  if (opts.time) exif.DateTimeOriginal = opts.time;
  if (opts.bias != null) exif.ExposureBiasValue = opts.bias;
  if (opts.model) exif.Model = opts.model;
  if (opts.lens) exif.LensModel = opts.lens;
  if (opts.focal != null) exif.FocalLength = opts.focal;
  return { id, filename, exif, created_at: '2026-06-07T10:00:00Z' };
}

const RIG = { model: 'ILCE-7M4', lens: 'FE 16-35', focal: 16 };

describe('detectAssetBracketGroups', () => {
  it('scores a filename run confirmed by EXIF at high confidence (no review)', () => {
    const assets = [
      asset('a1', 'OBM0001.ARW', { time: '2026:06:07 10:00:00', bias: -2, ...RIG }),
      asset('a2', 'OBM0002.ARW', { time: '2026:06:07 10:00:01', bias: 0, ...RIG }),
      asset('a3', 'OBM0003.ARW', { time: '2026:06:07 10:00:02', bias: 2, ...RIG }),
    ];
    const { groups, singleAssetIds } = detectAssetBracketGroups(assets);
    expect(groups).toHaveLength(1);
    expect(singleAssetIds).toHaveLength(0);
    const g = groups[0];
    expect(g.method).toBe('filename+exif');
    expect(g.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(g.reviewRequired).toBe(false);
    expect(g.size).toBe(3);
    // Ordered darkest -> brightest and base exposure tagged on the 0 EV frame.
    expect(g.assetIds).toEqual(['a1', 'a2', 'a3']);
    expect(g.roles['a2']).toBe('base_exposure');
  });

  it('flags a filename run with no EXIF as medium confidence but not review', () => {
    const assets = [
      asset('b1', 'OBM0010.ARW'),
      asset('b2', 'OBM0011.ARW'),
      asset('b3', 'OBM0012.ARW'),
    ];
    const { groups } = detectAssetBracketGroups(assets);
    expect(groups).toHaveLength(1);
    expect(groups[0].method).toBe('filename');
    expect(groups[0].confidence).toBe(0.82);
    expect(groups[0].reviewRequired).toBe(false);
    // No bias -> base exposure falls back to the middle frame.
    expect(groups[0].roles['b2']).toBe('base_exposure');
  });

  it('recovers an EXIF-only bracket and flags it for review', () => {
    // Non-sequential filenames so the filename pass leaves them as singles.
    const assets = [
      asset('c1', 'IMG_100.ARW', { time: '2026:06:07 11:00:00', bias: -2, ...RIG }),
      asset('c2', 'DSC_250.ARW', { time: '2026:06:07 11:00:01', bias: 0, ...RIG }),
      asset('c3', 'PXL_900.ARW', { time: '2026:06:07 11:00:02', bias: 2, ...RIG }),
    ];
    const { groups, singleAssetIds } = detectAssetBracketGroups(assets);
    expect(groups).toHaveLength(1);
    expect(groups[0].method).toBe('exif');
    expect(groups[0].confidence).toBeLessThan(REVIEW_THRESHOLD);
    expect(groups[0].reviewRequired).toBe(true);
    expect(singleAssetIds).toHaveLength(0);
  });

  it('leaves unrelated photos as singles', () => {
    const assets = [
      asset('s1', 'ONE001.JPG', { time: '2026:06:07 12:00:00', bias: 0, ...RIG }),
      asset('s2', 'TWO050.JPG', { time: '2026:06:07 12:30:00', bias: 0, ...RIG }),
    ];
    const { groups, singleAssetIds } = detectAssetBracketGroups(assets);
    expect(groups).toHaveLength(0);
    expect(singleAssetIds.sort()).toEqual(['s1', 's2']);
  });

  it('detects 5-shot filename brackets', () => {
    const assets = [1, 2, 3, 4, 5].map((n) =>
      asset(`f${n}`, `SEQ000${n}.ARW`, { time: `2026:06:07 13:00:0${n}`, bias: n - 3, ...RIG })
    );
    const { groups } = detectAssetBracketGroups(assets);
    expect(groups).toHaveLength(1);
    expect(groups[0].size).toBe(5);
    expect(groups[0].method).toBe('filename+exif');
  });

  it('flags a filename run as review when EXIF is present but disagrees', () => {
    // Sequential names, but EXIF has identical timestamps + identical bias, so
    // the EXIF detector won't confirm a bracket -> medium confidence + review.
    const assets = [
      asset('d1', 'DSC0001.ARW', { time: '2026:06:07 09:00:00', bias: 0, ...RIG }),
      asset('d2', 'DSC0002.ARW', { time: '2026:06:07 09:00:00', bias: 0, ...RIG }),
      asset('d3', 'DSC0003.ARW', { time: '2026:06:07 09:00:00', bias: 0, ...RIG }),
    ];
    const { groups } = detectAssetBracketGroups(assets);
    expect(groups).toHaveLength(1);
    expect(groups[0].method).toBe('filename');
    expect(groups[0].confidence).toBe(0.6);
    expect(groups[0].reviewRequired).toBe(true);
  });

  it('detects 7-shot filename+EXIF brackets', () => {
    const assets = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      asset(`g${n}`, `B000${n}.ARW`, { time: `2026:06:07 14:00:0${n}`, bias: n - 4, ...RIG })
    );
    const { groups } = detectAssetBracketGroups(assets);
    expect(groups).toHaveLength(1);
    expect(groups[0].size).toBe(7);
    expect(groups[0].reviewRequired).toBe(false);
  });
});

describe('looksLikeDrone', () => {
  it('matches DJI rigs and not normal cameras', () => {
    expect(looksLikeDrone({ id: 'a', filename: 'x.JPG', exif: { Make: 'DJI', Model: 'FC3411' } })).toBe(true);
    expect(looksLikeDrone({ id: 'b', filename: 'x.JPG', exif: { Model: 'Phantom 4' } })).toBe(true);
    expect(looksLikeDrone({ id: 'c', filename: 'x.ARW', exif: { Make: 'SONY', Model: 'ILCE-7M4' } })).toBe(false);
  });
});
