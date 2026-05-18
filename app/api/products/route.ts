import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Public endpoint — returns the full product catalog with pricing
 * computed for the given sqft. Used by the booking wizard.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sqft = Math.max(0, parseInt(url.searchParams.get('sqft') || '2000', 10));
  const supabase = createAdminClient();

  const { data: products, error } = await supabase
    .from('products')
    .select('id, slug, name, kind, short_description, long_description, cover_image_url, gallery_image_urls, is_addon, base_price_cents, duration_minutes, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute tier price per product in one round trip
  const ids = (products ?? []).map((p: any) => p.id);
  const { data: tiers } = await supabase
    .from('pricing_tiers')
    .select('product_id, min_sqft, max_sqft, price_cents')
    .in('product_id', ids);

  const { data: rec } = await supabase
    .from('product_recommended_addons')
    .select('product_id, addon_id');

  const tierByProduct = new Map<string, any[]>();
  for (const t of tiers ?? []) {
    const arr = tierByProduct.get((t as any).product_id) ?? [];
    arr.push(t);
    tierByProduct.set((t as any).product_id, arr);
  }

  const recByProduct = new Map<string, string[]>();
  for (const r of rec ?? []) {
    const arr = recByProduct.get((r as any).product_id) ?? [];
    arr.push((r as any).addon_id);
    recByProduct.set((r as any).product_id, arr);
  }

  const enriched = (products ?? []).map((p: any) => {
    const ts = tierByProduct.get(p.id) ?? [];
    // pick the tightest tier matching sqft
    const match = ts
      .filter(
        (t) =>
          (t.min_sqft == null || sqft >= t.min_sqft) &&
          (t.max_sqft == null || sqft <= t.max_sqft)
      )
      .sort((a, b) => (b.min_sqft ?? 0) - (a.min_sqft ?? 0))[0];
    const price_cents = match?.price_cents ?? p.base_price_cents;
    return {
      ...p,
      price_cents,
      recommended_addon_ids: recByProduct.get(p.id) ?? [],
    };
  });

  return NextResponse.json({ products: enriched, sqft });
}
