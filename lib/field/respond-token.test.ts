import { describe, it, expect, beforeAll } from 'vitest';
import { signRespondToken, verifyRespondToken, respondTokenExpiry } from './respond-token';

beforeAll(() => {
  process.env.RESPOND_LINK_SECRET = 'test-secret';
});

describe('respond token', () => {
  it('round-trips order + contractor', () => {
    const t = signRespondToken('order-1', 'contractor-1');
    expect(t).toBeTruthy();
    const p = verifyRespondToken(t);
    expect(p?.o).toBe('order-1');
    expect(p?.c).toBe('contractor-1');
  });

  it('rejects a tampered token', () => {
    const t = signRespondToken('order-1', 'contractor-1')!;
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ o: 'order-2', c: 'contractor-1', exp: 9e9 })).toString('base64url');
    expect(verifyRespondToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyRespondToken(`${body}.${sig}x`)).toBeNull();
    expect(verifyRespondToken('garbage')).toBeNull();
  });

  it('rejects an expired token', () => {
    const t = signRespondToken('order-1', 'contractor-1', Math.floor(Date.now() / 1000) - 1)!;
    expect(verifyRespondToken(t)).toBeNull();
  });

  it('is stable for the same shoot (so the calendar description does not churn)', () => {
    const exp = respondTokenExpiry('2026-09-09T18:00:00Z');
    expect(signRespondToken('order-1', 'contractor-1', exp)).toBe(
      signRespondToken('order-1', 'contractor-1', exp)
    );
    expect(exp).toBe(Math.floor(Date.parse('2026-09-09T18:00:00Z') / 1000) + 30 * 86_400);
  });
});

it('binds a new response link to its assignment version',()=>{
  const old=process.env.RESPOND_LINK_SECRET;process.env.RESPOND_LINK_SECRET='test-version-secret';
  const one=signRespondToken('order','contractor',Math.floor(Date.now()/1000)+3600,1)!;
  const two=signRespondToken('order','contractor',Math.floor(Date.now()/1000)+3600,2)!;
  expect(one).not.toBe(two);expect(verifyRespondToken(one)?.r).toBe(1);
  process.env.RESPOND_LINK_SECRET=old;
});
