import { describe, it, expect } from 'vitest';
import { clientIp, windowBucket, rateLimitKey } from './rate-limit';

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://x.test/api', { headers });
}

describe('clientIp', () => {
  it('takes the first IP from x-forwarded-for', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });
  it('falls back to x-real-ip then unknown', () => {
    expect(clientIp(reqWith({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIp(reqWith({}))).toBe('unknown');
  });
});

describe('windowBucket', () => {
  it('groups timestamps within the same window', () => {
    const w = 600; // 10 min
    // Window-aligned base so the boundary is exact: 1.2e12 ms = 2e9 s = bucket 2,000,000.
    const base = 600 * 1000 * 2_000_000;
    const a = windowBucket(base, w);
    const b = windowBucket(base + 599_000, w);
    const c = windowBucket(base + 601_000, w);
    expect(a).toBe(b);
    expect(c).toBe(a + 1);
  });
  it('never divides by zero', () => {
    expect(Number.isFinite(windowBucket(123456, 0))).toBe(true);
  });
});

describe('rateLimitKey', () => {
  it('composes scope:ip:bucket', () => {
    expect(rateLimitKey('booking', '1.2.3.4', 42)).toBe('booking:1.2.3.4:42');
  });
});
