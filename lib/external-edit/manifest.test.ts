import { describe, it, expect } from 'vitest';
import {
  buildExportName,
  normalizeStem,
  matchReturnedFile,
  type ManifestEntry,
} from './manifest';

const entry = (photo_id: string, export_name: string): ManifestEntry => ({ photo_id, export_name });

describe('buildExportName', () => {
  it('sequence-names with order prefix and keeps the original stem', () => {
    expect(buildExportName(142, 3, 'DSC01234.ARW')).toBe('ob142_003_DSC01234.arw');
  });

  it('sanitizes unsafe characters and caps stem length', () => {
    const name = buildExportName(7, 12, 'living room (final)!!.jpg');
    expect(name).toBe('ob7_012_living-room-final.jpg');
  });

  it('defaults extension when missing', () => {
    expect(buildExportName(1, 1, 'noext')).toBe('ob1_001_noext.jpg');
  });
});

describe('normalizeStem', () => {
  it('strips extension, case, separators', () => {
    expect(normalizeStem('OB142_003_DSC01234.jpg')).toBe('ob142003dsc01234');
  });

  it('strips editor suffixes and copy markers', () => {
    expect(normalizeStem('ob142_003_DSC01234-edited (1).jpg')).toBe('ob142003dsc01234');
    expect(normalizeStem('ob142_003_DSC01234_enhanced.jpg')).toBe('ob142003dsc01234');
  });
});

describe('matchReturnedFile', () => {
  const manifest = [
    entry('a', 'ob142_001_DSC01230.arw'),
    entry('b', 'ob142_002_DSC01231.arw'),
    entry('c', 'ob142_003_DSC01234.arw'),
  ];

  it('matches exact stems across extension changes', () => {
    const m = matchReturnedFile('ob142_003_DSC01234.jpg', manifest);
    expect(m).toEqual({ kind: 'match', entry: manifest[2] });
  });

  it('matches when the editor appends a suffix', () => {
    const m = matchReturnedFile('ob142_002_DSC01231-edited.jpg', manifest);
    expect(m).toEqual({ kind: 'match', entry: manifest[1] });
  });

  it('matches unique containment (editor prefixes the name)', () => {
    const m = matchReturnedFile('fotello-ob142_001_DSC01230-v2final.jpg', manifest);
    // trailing "final" is stripped as an editor suffix; the remaining stem
    // contains exactly one manifest stem.
    expect(m.kind).toBe('match');
    expect((m as any).entry.photo_id).toBe('a');
  });

  it('reports ambiguity instead of guessing', () => {
    const twins = [entry('x', 'ob1_001_A.jpg'), entry('y', 'ob1_002_A.jpg')];
    // Neither stem matches exactly; both contain the returned stem check needs
    // ≥6 chars, so use realistic names.
    const near = [entry('x', 'ob142_001_room.jpg'), entry('y', 'ob142_001_rooms.jpg')];
    const m = matchReturnedFile('ob142_001_room.jpg', near);
    // exact match on 'x' wins even though 'y' contains it
    expect(m).toEqual({ kind: 'match', entry: near[0] });
    const amb = matchReturnedFile('zz-ob1_001_A-ob1_002_A.jpg', twins);
    expect(amb.kind).not.toBe('match');
  });

  it('returns none for unrelated names', () => {
    expect(matchReturnedFile('IMG_9999.jpg', manifest)).toEqual({ kind: 'none' });
  });
});
