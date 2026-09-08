import { afterEach, expect, it, vi } from 'vitest';
import { paywallFor } from './gate';

afterEach(() => vi.unstubAllEnvs());

it.each(['', 'sk_test_fixture_only'])('keeps priced unpaid orders locked with Stripe key %j', key => {
  vi.stubEnv('STRIPE_SECRET_KEY', key);
  expect(paywallFor({ total_cents: 100, download_paid_at: null })).toEqual({
    active: true, paid: false, priceCents: 100, currency: 'usd',
  });
});

it('keeps a paid order downloadable during a payment configuration outage', () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  expect(paywallFor({ total_cents: 100, download_paid_at: '2026-09-08T17:39:27Z' }).active).toBe(false);
});

it.each([0, null])('keeps an unpriced order downloadable (%j)', total_cents => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  expect(paywallFor({ total_cents, download_paid_at: null }).active).toBe(false);
});
