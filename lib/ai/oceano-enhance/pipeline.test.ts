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
