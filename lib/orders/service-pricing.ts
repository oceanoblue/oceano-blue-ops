import { z } from 'zod';

export type PricingTier = { min_sqft: number | null; max_sqft: number | null; price_cents: number };
export type ServiceProduct = { id: string; name: string; base_price_cents: number; pricing_tiers?: PricingTier[] };

/** Mirrors price_for_sqft: most specific matching lower bound, then base price. */
export function servicePrice(product: ServiceProduct, sqft: number | null): number {
  const size = sqft ?? 0;
  const tier = [...(product.pricing_tiers ?? [])]
    .filter(t => (t.min_sqft === null || size >= t.min_sqft) && (t.max_sqft === null || size <= t.max_sqft))
    .sort((a, b) => (b.min_sqft ?? -1) - (a.min_sqft ?? -1))[0];
  return tier?.price_cents ?? product.base_price_cents;
}

export function dollarsToCents(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value.trim())) return NaN;
  return Math.round(Number(value) * 100);
}

export const serviceEditSchema = z.object({
  expected_updated_at: z.string().datetime({ offset: true }),
  sqft: z.number().int().min(1).max(1000000).nullable(),
  expected_sqft: z.number().int().nullable(),
  adjustment_cents: z.number().int().min(-100000000).max(100000000),
  items: z.array(z.object({
    product_id: z.string().uuid().nullable(),
    description: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(20),
    unit_price_cents: z.number().int().min(0).max(10000000),
  })).max(30),
}).refine(v => {
  const total = v.items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0) + v.adjustment_cents;
  return total >= 0 && total <= 100000000;
}, 'Total must be between $0 and $1,000,000.');
