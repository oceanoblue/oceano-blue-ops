import { describe, it, expect } from 'vitest';
import { isSceneType, heuristicScene, sceneBadgeClass, SCENE_TYPES } from './scene';

describe('isSceneType', () => {
  it('accepts known scene types', () => {
    for (const s of SCENE_TYPES) expect(isSceneType(s)).toBe(true);
  });
  it('rejects unknown values', () => {
    expect(isSceneType('kitchen')).toBe(false);
    expect(isSceneType(null)).toBe(false);
    expect(isSceneType(42)).toBe(false);
  });
});

describe('heuristicScene', () => {
  it('flags drones from EXIF make/model', () => {
    expect(heuristicScene({ id: 'a', filename: 'DJI_0001.JPG', exif: { Make: 'DJI', Model: 'FC3411' } })).toBe('drone');
    expect(heuristicScene({ id: 'b', filename: 'x.JPG', exif: { Model: 'Mavic 3' } })).toBe('drone');
  });
  it('defaults to unknown for normal cameras', () => {
    expect(heuristicScene({ id: 'c', filename: 'x.ARW', exif: { Make: 'SONY', Model: 'ILCE-7M4' } })).toBe('unknown');
    expect(heuristicScene({ id: 'd', filename: 'x.JPG', exif: {} })).toBe('unknown');
  });
});

describe('sceneBadgeClass', () => {
  it('returns a class for every scene and a slate fallback', () => {
    expect(sceneBadgeClass('interior')).not.toBe(sceneBadgeClass('unknown'));
    expect(sceneBadgeClass(null)).toContain('slate');
    expect(sceneBadgeClass('not-a-scene')).toContain('slate');
  });
});
