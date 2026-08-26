import type { createAdminClient } from '@/lib/supabase/server';

export type QuoteLineItem = {
  slug: string;
  name: string;
  price_cents: number;
  complimentary?: boolean;
};

/**
 * Compute a quote's line items from the selected product slugs + sqft, applying
 * Oceano Blue's bundling rules (PRICING.md):
 *  - Photography is sqft-tiered (price_for_sqft).
 *  - Drone stills and/or video is ONE charge (one trip): $100 with photos, $200
 *    standalone.
 *  - 3D Home + Floor Plan INCLUDES the floor plan; a separate floor plan then
 *    shows Included. 3D is $100 with photos, $200 standalone.
 *  - Matterport is a separate product, never bundled.
 *  - Simple add-ons priced from the catalog; virtual twilight / amenities free.
 */
export async function computeQuoteItems(
  admin: ReturnType<typeof createAdminClient>,
  sqft: number | null,
  slugs: string[]
): Promise<{ items: QuoteLineItem[]; subtotal_cents: number }> {
  const want = new Set(slugs);
  const has = (s: string) => want.has(s);

  const { data: prods } = await (admin as any)
    .from('products')
    .select('id, slug, name, base_price_cents, standalone_price_cents')
    .in('slug', [
      'interior_exterior_photo', 'cinematic_video', 'social_reel', 'floor_plan',
      'drone_photography', 'drone_video', 'three_d_floor_plan', 'matterport_3d',
      'same_day_delivery', 'twilight', 'virtual_tour', 'virtual_twilight', 'amenities',
    ]);
  const bySlug = new Map<string, any>((prods ?? []).map((p: any) => [p.slug, p]));
  const base = (slug: string, fallback = 0) => bySlug.get(slug)?.base_price_cents ?? fallback;

  const items: QuoteLineItem[] = [];
  const add = (slug: string, name: string, price_cents: number, complimentary = false) =>
    items.push({ slug, name, price_cents, complimentary });

  const hasPhotos = has('interior_exterior_photo');

  // Photography — sqft-tiered.
  if (hasPhotos) {
    const p = bySlug.get('interior_exterior_photo');
    let price = base('interior_exterior_photo', 25000);
    if (p) {
      const { data: tiered } = await (admin as any).rpc('price_for_sqft', {
        p_product_id: p.id,
        p_sqft: sqft ?? 0,
      });
      if (typeof tiered === 'number' && tiered > 0) price = tiered;
    }
    add('interior_exterior_photo', p?.name ?? 'Interior/Exterior Photography', price);
  }

  if (has('cinematic_video')) add('cinematic_video', 'Cinematic Videography', base('cinematic_video', 55000));
  if (has('social_reel')) add('social_reel', 'Social Reel', base('social_reel', 12500));

  // Drone: stills and/or video → one charge (one trip). Add-on vs standalone.
  if (has('drone_photography') || has('drone_video')) {
    const both = has('drone_photography') && has('drone_video');
    const name = both ? 'Drone Photos + Video' : has('drone_photography') ? 'Drone Photography' : 'Drone Video';
    add('drone', name, hasPhotos ? 10000 : 20000);
  }

  // 3D Home + Floor Plan — includes the floor plan.
  if (has('three_d_floor_plan')) {
    add('three_d_floor_plan', '3D Home + Floor Plan', hasPhotos ? 10000 : 20000);
    if (has('floor_plan')) add('floor_plan', 'Floor Plan', 0, true); // included in 3D
  } else if (has('floor_plan')) {
    add('floor_plan', 'Floor Plan', base('floor_plan', 9500));
  }

  if (has('matterport_3d')) add('matterport_3d', 'Matterport 3D Tour', bySlug.get('matterport_3d')?.standalone_price_cents ?? 29500);
  if (has('same_day_delivery')) add('same_day_delivery', 'Same-Day Delivery', base('same_day_delivery', 10000));
  if (has('twilight')) add('twilight', 'Twilight Shoot', base('twilight', 15000));
  if (has('virtual_tour')) add('virtual_tour', 'Virtual Tour', base('virtual_tour', 12500));
  if (has('virtual_twilight')) add('virtual_twilight', 'Virtual Twilight', 0, true);
  if (has('amenities')) add('amenities', 'Community Amenity Photos', 0, true);

  const subtotal_cents = items.reduce((s, i) => s + (i.complimentary ? 0 : i.price_cents), 0);
  return { items, subtotal_cents };
}
