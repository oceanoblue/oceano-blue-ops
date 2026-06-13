import { describe, it, expect } from 'vitest';
import { hammingDistance, clusterDuplicates, type Fingerprinted } from './dedupe';

describe('hammingDistance', () => {
  it('is 0 for identical hashes', () => {
    expect(hammingDistance(0xff00ffn, 0xff00ffn)).toBe(0);
  });

  it('counts differing bits', () => {
    expect(hammingDistance(0b1010n, 0b0000n)).toBe(2);
    expect(hammingDistance(0b1111n, 0b0000n)).toBe(4);
  });

  it('is symmetric', () => {
    const a = 0xdeadbeefn;
    const b = 0x0badf00dn;
    expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
  });
});

describe('clusterDuplicates', () => {
  it('returns no clusters when all frames are distinct', () => {
    const items: Fingerprinted[] = [
      { id: 'a', hash: 0x0000000000000000n, sharpness: 1 },
      { id: 'b', hash: 0xffffffffffffffffn, sharpness: 1 },
      { id: 'c', hash: 0x00000000ffffffffn, sharpness: 1 },
    ];
    expect(clusterDuplicates(items, 10)).toEqual([]);
  });

  it('clusters near-identical frames and keeps the sharpest', () => {
    const items: Fingerprinted[] = [
      { id: 'shot1a', hash: 0b1111_0000n, sharpness: 50 },
      { id: 'shot1b', hash: 0b1111_0001n, sharpness: 90 }, // 1 bit off, sharpest
      { id: 'shot1c', hash: 0b1111_0011n, sharpness: 30 }, // 2 bits off
      { id: 'other', hash: 0xffffffffn, sharpness: 100 },
    ];
    const clusters = clusterDuplicates(items, 4);
    expect(clusters).toHaveLength(1);
    const c = clusters[0];
    expect(c.bestId).toBe('shot1b');
    expect(c.rejectedIds.sort()).toEqual(['shot1a', 'shot1c']);
    expect(c.ids[0]).toBe('shot1b'); // best first
    expect(c.ids).not.toContain('other'); // distinct frame stays out
  });

  it('does not pull in a frame beyond the threshold', () => {
    const items: Fingerprinted[] = [
      { id: 'a', hash: 0b0000n, sharpness: 1 },
      { id: 'b', hash: 0b0001n, sharpness: 1 }, // 1 bit
      { id: 'c', hash: 0b1111n, sharpness: 1 }, // 4 bits from a
    ];
    const clusters = clusterDuplicates(items, 1);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids.sort()).toEqual(['a', 'b']);
  });

  it('links transitively (a~b, b~c ⇒ one cluster)', () => {
    const items: Fingerprinted[] = [
      { id: 'a', hash: 0b0000n, sharpness: 10 },
      { id: 'b', hash: 0b0001n, sharpness: 20 },
      { id: 'c', hash: 0b0011n, sharpness: 30 }, // 2 bits from a, 1 from b
    ];
    const clusters = clusterDuplicates(items, 1);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids.sort()).toEqual(['a', 'b', 'c']);
    expect(clusters[0].bestId).toBe('c');
  });

  it('breaks sharpness ties toward the earlier frame', () => {
    const items: Fingerprinted[] = [
      { id: 'first', hash: 0b0000n, sharpness: 42 },
      { id: 'second', hash: 0b0001n, sharpness: 42 },
    ];
    expect(clusterDuplicates(items, 2)[0].bestId).toBe('first');
  });
});
