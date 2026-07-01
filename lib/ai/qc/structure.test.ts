import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { computeStructureDrift, ncc, structureScoreFromRaw, DRIFT_THRESHOLD } from './structure';

/**
 * Structure-drift invariants. The whole point of the signal: heavy but honest
 * TONE edits score high; redrawn GEOMETRY scores low. Synthetic scenes are
 * rasterized from SVG so the tests are fully deterministic.
 */

const W = 256;
const H = 256;

// A "room": strong architectural edges (window grid, counter, door).
const SCENE = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#c8c2b8"/>
  <rect x="20" y="30" width="80" height="100" fill="#f4f1ea" stroke="#5a544c" stroke-width="4"/>
  <line x1="60" y1="30" x2="60" y2="130" stroke="#5a544c" stroke-width="4"/>
  <line x1="20" y1="80" x2="100" y2="80" stroke="#5a544c" stroke-width="4"/>
  <rect x="130" y="90" width="100" height="60" fill="#6f6558"/>
  <rect x="140" y="170" width="90" height="70" fill="#8a7f6e" stroke="#3f3a33" stroke-width="3"/>
  <circle cx="50" cy="200" r="24" fill="#4a5a4c"/>
</svg>`;

// Same scene with the counter REPLACED by different geometry (redrawn content).
const SCENE_REDRAWN = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#c8c2b8"/>
  <rect x="20" y="30" width="80" height="100" fill="#f4f1ea" stroke="#5a544c" stroke-width="4"/>
  <line x1="60" y1="30" x2="60" y2="130" stroke="#5a544c" stroke-width="4"/>
  <line x1="20" y1="80" x2="100" y2="80" stroke="#5a544c" stroke-width="4"/>
  <ellipse cx="180" cy="120" rx="60" ry="35" fill="#6f6558"/>
  <polygon points="140,240 185,160 230,240" fill="#8a7f6e" stroke="#3f3a33" stroke-width="3"/>
  <rect x="30" y="180" width="45" height="45" fill="#4a5a4c"/>
</svg>`;

async function png(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('structure drift', () => {
  it('identical image scores ~1', async () => {
    const img = await png(SCENE);
    const res = await computeStructureDrift(img, img);
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThan(0.98);
    expect(res!.drifted).toBe(false);
  });

  it('is invariant to heavy tone edits (bright + gamma + saturation)', async () => {
    const img = await png(SCENE);
    const relit = await sharp(img).modulate({ brightness: 1.45, saturation: 0.8 }).gamma(2.4).png().toBuffer();
    const res = await computeStructureDrift(img, relit);
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThan(0.85);
    expect(res!.drifted).toBe(false);
  });

  it('flags redrawn geometry well below an honest relight', async () => {
    const img = await png(SCENE);
    const relit = await sharp(img).modulate({ brightness: 1.45 }).gamma(2.4).png().toBuffer();
    const redrawn = await png(SCENE_REDRAWN);
    const honest = await computeStructureDrift(img, relit);
    const dishonest = await computeStructureDrift(img, redrawn);
    expect(honest).not.toBeNull();
    expect(dishonest).not.toBeNull();
    // The redrawn scene must score materially lower than the honest relight.
    expect(dishonest!.score).toBeLessThan(honest!.score - 0.2);
  });

  it('unrelated content lands under the drift threshold', async () => {
    const img = await png(SCENE);
    // "Completely different photo": pure vertical stripes share no structure.
    const stripes = await sharp(
      Buffer.from(
        `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${Array.from(
          { length: 16 },
          (_, i) => `<rect x="${i * 16}" y="0" width="8" height="${H}" fill="#222"/>`
        ).join('')}</svg>`
      )
    )
      .png()
      .toBuffer();
    const res = await computeStructureDrift(img, stripes);
    expect(res).not.toBeNull();
    expect(res!.score).toBeLessThan(DRIFT_THRESHOLD);
    expect(res!.drifted).toBe(true);
  });

  it('ncc: flat (structureless) maps read as no-drift, not NaN', () => {
    const flat = new Float32Array(64);
    expect(ncc(flat, flat)).toBe(1);
  });

  it('pure core rounds and thresholds', () => {
    const w = 16;
    const h = 16;
    const a = new Uint8Array(w * h).fill(0);
    for (let y = 0; y < h; y++) a[y * w + 8] = 255; // one vertical edge
    const same = structureScoreFromRaw(a, a, w, h);
    expect(same.score).toBeGreaterThan(0.99);
    expect(same.drifted).toBe(false);
  });
});
