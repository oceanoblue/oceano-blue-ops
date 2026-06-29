import { describe, it, expect } from 'vitest';
import { blownFractionFromRaw, BLOWN_LEVEL } from './clipping';

// Build a packed RGB raw buffer from per-pixel [r,g,b] triples.
function raw(pixels: Array<[number, number, number]>): Uint8Array {
  const out = new Uint8Array(pixels.length * 3);
  pixels.forEach(([r, g, b], i) => {
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  });
  return out;
}

describe('blownFractionFromRaw', () => {
  it('counts a pixel blown only when ALL channels are at/above the level', () => {
    const data = raw([
      [255, 255, 255], // blown
      [253, 252, 254], // blown (all ≥ 252)
      [255, 255, 100], // NOT blown (blue channel holds detail — e.g. a window with sky)
      [120, 120, 120], // mid grey, not blown
    ]);
    const { blownFraction, sampled } = blownFractionFromRaw(data, 3);
    expect(sampled).toBe(4);
    expect(blownFraction).toBe(0.5); // 2 of 4
  });

  it('a fully bright frame is entirely blown; a mid-grey frame is not', () => {
    expect(blownFractionFromRaw(raw([[255, 255, 255], [255, 255, 255]]), 3).blownFraction).toBe(1);
    expect(blownFractionFromRaw(raw([[128, 128, 128], [200, 200, 200]]), 3).blownFraction).toBe(0);
  });

  it('respects the channel stride (ignores alpha)', () => {
    // RGBA: one blown opaque pixel, one mid pixel.
    const rgba = new Uint8Array([255, 255, 255, 255, 100, 100, 100, 255]);
    expect(blownFractionFromRaw(rgba, 4).blownFraction).toBe(0.5);
  });

  it('a just-under-level pixel is not blown (conservative boundary)', () => {
    const data = raw([[BLOWN_LEVEL - 1, BLOWN_LEVEL - 1, BLOWN_LEVEL - 1]]);
    expect(blownFractionFromRaw(data, 3).blownFraction).toBe(0);
  });

  it('is safe on empty / malformed input', () => {
    expect(blownFractionFromRaw(new Uint8Array(0), 3)).toEqual({ blownFraction: 0, sampled: 0 });
    expect(blownFractionFromRaw(new Uint8Array([255, 255]), 3).sampled).toBe(0);
  });
});
