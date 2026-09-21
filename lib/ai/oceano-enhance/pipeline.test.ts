import { describe, it, expect } from 'vitest';
import { wbGains } from './pipeline';

describe('wbGains (white-balance gains from a bright-neutral sample)', () => {
  it('leaves a neutral sample essentially untouched', () => {
    const { rGain, bGain } = wbGains(200, 200, 200);
    expect(rGain).toBeCloseTo(1, 5);
    expect(bGain).toBeCloseTo(1, 5);
  });

  it('cools a warm/pink sample (high red → red gain < 1)', () => {
    const { rGain } = wbGains(220, 200, 190);
    expect(rGain).toBeLessThan(1);
  });

  it('warms a blue sample (high blue → blue gain < 1)', () => {
    const { bGain } = wbGains(190, 200, 230);
    expect(bGain).toBeLessThan(1);
  });

  it('boosts a deficient channel above 1 (warm cast → lift blue)', () => {
    const { bGain } = wbGains(210, 200, 175);
    expect(bGain).toBeGreaterThan(1);
  });

  it('clamps extreme corrections into a safe band', () => {
    const { rGain, bGain } = wbGains(10, 200, 10);
    expect(rGain).toBeLessThanOrEqual(1.22);
    expect(rGain).toBeGreaterThanOrEqual(0.82);
    expect(bGain).toBeLessThanOrEqual(1.22);
    expect(bGain).toBeGreaterThanOrEqual(0.82);
  });

  it('is a no-op when a channel mean is zero', () => {
    expect(wbGains(0, 200, 200)).toMatchObject({ rGain: 1 });
  });
});

import sharp from 'sharp';
import { enhanceSingle } from './pipeline';
it('highlight recovery darkens highlights while preserving shadows in an adjustment', async () => {
  const pixels = Buffer.alloc(128 * 64 * 3);
  for (let y=0;y<64;y++) for (let x=0;x<128;x++) for(let c=0;c<3;c++) pixels[(y*128+x)*3+c]=x<64?80:235;
  const input=await sharp(pixels,{raw:{width:128,height:64,channels:3}}).png().toBuffer();
  const out=await enhanceSingle(input,{highlights:0.8,sharpening:0},'adjustment');
  const pixelsOut = await sharp(out.bytes).raw().toBuffer();
  const dark = pixelsOut[(16 * 128 + 16) * 3];
  const light = pixelsOut[(16 * 128 + 96) * 3];
  expect(dark).toBeGreaterThan(77); expect(dark).toBeLessThan(83);
  expect(light).toBeLessThan(215);
});
