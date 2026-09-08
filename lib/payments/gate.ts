/** The order fields the paywall needs to decide lock state. */
export type PaywallOrder = {
  total_cents: number | null;
  download_paid_at: string | null;
};

export type PaywallState = {
  /** This order has a price and has not been paid yet. */
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
 * Payment configuration controls whether checkout is available, not access to
 * purchased files. A missing Stripe key must never release an unpaid order.
 * Free orders and orders with a recorded payment remain downloadable.
 */
export function paywallFor(order: PaywallOrder | null | undefined): PaywallState {
  const priceCents = order?.total_cents ?? 0;
  const paid = !!order?.download_paid_at;
  const active = priceCents > 0 && !paid;
  return { active, paid, priceCents, currency: 'usd' };
}
