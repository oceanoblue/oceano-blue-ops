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

  it('does NOT group sequential frames that share an exposure bias (not a bracket)', () => {
    // Sequential names, identical timestamps + identical bias: three frames at
    // the same exposure are not an HDR bracket, so the EXIF-aware engine keeps
    // them as singles rather than inventing a low-confidence bracket.
    const assets = [
      asset('d1', 'DSC0001.ARW', { time: '2026:06:07 09:00:00', bias: 0, ...RIG }),
      asset('d2', 'DSC0002.ARW', { time: '2026:06:07 09:00:00', bias: 0, ...RIG }),
      asset('d3', 'DSC0003.ARW', { time: '2026:06:07 09:00:00', bias: 0, ...RIG }),
    ];
    const { groups, singleAssetIds } = detectAssetBracketGroups(assets);
    expect(groups).toHaveLength(0);
    expect(singleAssetIds.sort()).toEqual(['d1', 'd2', 'd3']);
  });

  it('separates brackets from interspersed detail singles in one continuous run', () => {
    // The real "two 5-brackets, no singles" bug: a continuous filename sequence
    // mixing 3-shot brackets with lone detail singles. Capture-time gaps isolate
    // the singles; the exposure-bias cycle confirms each bracket.
    const assets = [
      // 3-shot bracket, fired in the same second
      asset('m1', 'OBM0010.ARW', { time: '2026:06:07 10:00:00', bias: -2, ...RIG }),
      asset('m2', 'OBM0011.ARW', { time: '2026:06:07 10:00:00', bias: 0, ...RIG }),
      asset('m3', 'OBM0012.ARW', { time: '2026:06:07 10:00:00', bias: 2, ...RIG }),
      // lone detail single, a few seconds later
      asset('m4', 'OBM0013.ARW', { time: '2026:06:07 10:00:03', bias: 0, ...RIG }),
      // another 3-shot bracket
      asset('m5', 'OBM0014.ARW', { time: '2026:06:07 10:00:06', bias: -2, ...RIG }),
      asset('m6', 'OBM0015.ARW', { time: '2026:06:07 10:00:06', bias: 0, ...RIG }),
      asset('m7', 'OBM0016.ARW', { time: '2026:06:07 10:00:06', bias: 2, ...RIG }),
    ];
    const { groups, singleAssetIds } = detectAssetBracketGroups(assets);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.size === 3)).toBe(true);
    expect(groups.every((g) => g.method === 'filename+exif')).toBe(true);
    expect(groups.every((g) => g.reviewRequired === false)).toBe(true);
    expect(singleAssetIds).toEqual(['m4']);
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
