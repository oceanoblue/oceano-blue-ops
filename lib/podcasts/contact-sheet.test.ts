import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildContactSheet, sheetLayout } from './contact-sheet';

describe('sheetLayout', () => {
  it('lays 12 tiles in a 4x3 grid with gutters', () => {
    const l = sheetLayout([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(l.width).toBe(8 + 4 * (320 + 8));
    expect(l.height).toBe(8 + 3 * (180 + 8));
    expect(l.tiles[0]).toEqual({ index: 1, left: 8, top: 8 });
    expect(l.tiles[4]).toEqual({ index: 5, left: 8, top: 8 + 188 });
    expect(l.tiles[11]).toEqual({ index: 12, left: 8 + 3 * 328, top: 8 + 2 * 188 });
  });

  it('shrinks the canvas to the used columns/rows', () => {
    expect(sheetLayout([1]).width).toBe(8 + 328);
    expect(sheetLayout([1, 2, 3, 4, 5]).height).toBe(8 + 2 * 188);
  });
});

describe('buildContactSheet', () => {
  it('renders a JPEG of the computed size', async () => {
    const tile = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const out = await buildContactSheet([1, 2, 3].map((index) => ({ index, bytes: tile })));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(8 + 3 * 328);
    expect(meta.height).toBe(8 + 188);
  });

  it('rejects an empty set', async () => {
    await expect(buildContactSheet([])).rejects.toThrow('no_frames');
  });
});
