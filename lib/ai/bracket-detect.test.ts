import { describe, expect, it } from 'vitest';
import { detectBrackets, isShutterBracket } from './bracket-detect';
import { detectAssetBracketGroups } from '../photos/asset-bracket-detect';
import type { Photo } from '../supabase/database.types';

function burst(): Photo[] {
  return [1 / 13, 1 / 100, 0.6].map((shutter, i) => ({
    id: `p${i}`, filename: `IMG_${1426 + i}.jpg`, created_at: '2026-09-08T12:00:00Z',
    exif: { DateTimeOriginal: '2026-08-24T12:27:35', Model: 'Canon EOS R5',
      LensModel: 'EF16-35mm f/2.8L II USM', FocalLength: 16, ISO: 100,
      FNumber: 8, ExposureTime: shutter, ExposureBiasValue: 0 },
  })) as unknown as Photo[];
}

describe('same-bias shutter bracket proposals', () => {
  it('requires opt-in and flags the asset proposal for human review', () => {
    const photos = burst();
    expect(detectBrackets(photos).size).toBe(0);
    expect(detectBrackets(photos, { allowShutterFallback: true }).size).toBe(1);
    const { groups } = detectAssetBracketGroups(photos.map(p => ({ ...p, exif: p.exif as Record<string, unknown> })));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ method: 'exif-exposure', reviewRequired: true,
      assetIds: ['p1', 'p0', 'p2'], roles: { p0: 'base_exposure' } });
  });

  it('orders rational shutter strings by exposure for the reviewed proposal', () => {
    const photos = burst();
    ['1/13', '1/100', '6/10'].forEach((t, i) => { (photos[i].exif as any).ExposureTime = t; });
    const { groups } = detectAssetBracketGroups(photos.map(p => ({ ...p, exif: p.exif as Record<string, unknown> })));
    expect(groups[0]?.assetIds).toEqual(['p1', 'p0', 'p2']);
    expect(groups[0]?.reviewRequired).toBe(true);
  });

  it.each(['DateTimeOriginal', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ISO', 'ExposureTime', 'ExposureBiasValue'])(
    'rejects incomplete %s metadata even with sequential names and upload times', key => {
      const photos = burst();
      delete (photos[1].exif as Record<string, unknown>)[key];
      expect(isShutterBracket(photos)).toBe(false);
      expect(detectBrackets(photos, { allowShutterFallback: true }).size).toBe(0);
    });

  it.each([['ISO', 200], ['FNumber', 11], ['FocalLength', 20], ['Model', 'Other body'],
    ['LensModel', 'Other lens'], ['Flash', 1], ['ExposureTime', 1 / 13],
    ['ExposureTime', NaN], ['DateTimeOriginal', '2026-08-24T12:28:00']])(
    'rejects inconsistent %s=%s', (key, value) => {
      const photos = burst();
      (photos[1].exif as Record<string, unknown>)[key] = value;
      expect(isShutterBracket(photos)).toBe(false);
    });

  it('rejects near-identical metered shutter changes and unsupported burst sizes', () => {
    const photos = burst();
    [1 / 100, 1 / 90, 1 / 80].forEach((t, i) => { (photos[i].exif as any).ExposureTime = t; });
    expect(isShutterBracket(photos)).toBe(false);
    expect(isShutterBracket(burst().slice(0, 2))).toBe(false);
  });
});
