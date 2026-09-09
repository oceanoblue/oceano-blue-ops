import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';

/**
 * One JPEG showing every candidate frame the picker considered, numbered, so
 * the owner can see (in Dropbox) why a hosts/guest frame was or wasn't chosen.
 * Tiles read left→right, top→bottom in frame order, so even if the numeral
 * overlay fails to render (no fonts on a serverless host) the order is clear.
 */

export type SheetOptions = { cols: number; tileW: number; tileH: number; gap: number };
const DEFAULTS: SheetOptions = { cols: 4, tileW: 320, tileH: 180, gap: 8 };

export function sheetLayout(indexes: number[], opts: Partial<SheetOptions> = {}) {
  const { cols, tileW, tileH, gap } = { ...DEFAULTS, ...opts };
  const n = indexes.length;
  const rows = Math.max(1, Math.ceil(n / cols));
  const usedCols = Math.min(cols, Math.max(1, n));
  return {
    width: gap + usedCols * (tileW + gap),
    height: gap + rows * (tileH + gap),
    tiles: indexes.map((index, i) => ({
      index,
      left: gap + (i % cols) * (tileW + gap),
      top: gap + Math.floor(i / cols) * (tileH + gap),
    })),
  };
}

function numeral(n: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="24">` +
      `<rect width="44" height="24" rx="4" fill="#15204a" fill-opacity="0.85"/>` +
      `<text x="22" y="17" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">${n}</text>` +
      `</svg>`
  );
}

export async function buildContactSheet(
  frames: { index: number; bytes: Buffer }[],
  opts: Partial<SheetOptions> = {}
): Promise<Buffer> {
  if (frames.length === 0) throw new Error('no_frames');
  const o = { ...DEFAULTS, ...opts };
  const layout = sheetLayout(frames.map((f) => f.index), o);

  const composites: OverlayOptions[] = [];
  for (let i = 0; i < frames.length; i++) {
    const { left, top } = layout.tiles[i];
    const tile = await sharp(frames[i].bytes).resize(o.tileW, o.tileH, { fit: 'cover' }).png().toBuffer();
    composites.push({ input: tile, left, top });
    composites.push({ input: numeral(frames[i].index), left: left + 6, top: top + 6 });
  }

  return sharp({ create: { width: layout.width, height: layout.height, channels: 3, background: '#0b1230' } })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
}
