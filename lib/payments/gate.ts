import { isStripeConfigured } from '@/lib/stripe/server';

/** The order fields the paywall needs to decide lock state. */
export type PaywallOrder = {
  total_cents: number | null;
  download_paid_at: string | null;
};

export type PaywallState = {
  /** Stripe is configured AND this order has a price AND it isn't paid yet. */
  active: boolean;
  /** Whether this order has already been paid for. */
  paid: boolean;
  /** The amount (cents) that unlocks downloads for this order. */
  priceCents: number;
  currency: 'usd';
};

/**
 * Single source of truth for "should downloads be locked for this order".
 *
 * The paywall is only ever ACTIVE when: Stripe keys exist, the order carries a
 * price (> 0), and it hasn't been paid. If Stripe isn't configured, or the
 * order has no price, downloads behave exactly as they did before — nothing is
 * gated. This is what lets us ship the feature dormant.
 */
export function paywallFor(order: PaywallOrder | null | undefined): PaywallState {
  const priceCents = order?.total_cents ?? 0;
  const paid = !!order?.download_paid_at;
  const active = isStripeConfigured() && priceCents > 0 && !paid;
  return { active, paid, priceCents, currency: 'usd' };
}
