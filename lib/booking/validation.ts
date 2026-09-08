import { z } from 'zod';

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const BookingBody = z.object({
  client_email: z.string().trim().toLowerCase().email().max(254),
  client_name: z.string().trim().min(1).max(200),
  client_phone: z.string().max(40).optional().default(''),
  client_brokerage: z.string().max(200).optional().default(''),
  address_line1: z.string().trim().min(2).max(300),
  address_line2: z.string().max(200).optional().default(''),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  sqft: z.number().int().min(0).max(1000000),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(720),
  timezone: z.string().refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
    catch { return false; }
  }).default('America/New_York'),
  photographer_id: z.string().uuid(),
  access_method: z.string().max(2000).optional().default(''),
  highlights: z.string().max(5000).optional().default(''),
  project_type: z.enum(['mls_real_estate', 'luxury_real_estate', 'architectural', 'interior_design']).default('mls_real_estate'),
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(20).default(1) })).min(1).max(30)
    .refine(items => new Set(items.map(item => item.product_id)).size === items.length, 'Duplicate products'),
});
export type BookingInput = z.infer<typeof BookingBody>;

export function productDuration(items: BookingInput['items'], products: Array<{ id: string; duration_minutes: number }>): number {
  const duration = items.reduce((sum, item) => {
    const product = products.find(product => product.id === item.product_id);
    if (!product) throw new Error('invalid_product');
    return sum + product.duration_minutes * item.quantity;
  }, 0);
  if (!Number.isInteger(duration) || duration < 15 || duration > 720) throw new Error('invalid_duration');
  return duration;
}
