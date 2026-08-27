import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeliverable } from '@/lib/photos/deliverable';
import { toEmbedUrl } from '@/lib/deliverables/embed';
import { paywallFor } from '@/lib/payments/gate';

/** Returns gallery metadata + signed URLs for the token. Public endpoint. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();

  const { data: link, error } = await supabase
    .from('delivery_links')
    .select('id, order_id, expires_at')
    .eq('token', params.token)
    .single();
  if (error || !link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  // Bump view counter
  await supabase
    .from('delivery_links')
    .update({
      view_count: (await getCount(supabase, link.id, 'view_count')) + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq('id', link.id);

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, listing_id, client_id, total_cents, download_paid_at')
    .eq('id', link.order_id)
    .single();
  if (!order) return NextResponse.json({ error: 'order_missing' }, { status: 404 });

  // Locked orders (Stripe on + priced + unpaid) show watermarked previews only;
  // the clean masters are never signed until payment unlocks the order.
  const pay = paywallFor(order as any);

  const { data: listing } = await supabase
    .from('listings')
    .select('address_line1, city, state, zip')
    .eq('id', order.listing_id)
    .single();

  const { data: photos } = await supabase
    .from('photos')
    .select('id, filename, bucket, storage_path, width, height, sort_order, room_type, is_hdr, ai_provider')
    .eq('order_id', order.id)
    .in('kind', ['processed', 'delivered'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true });

  const deliverable = (photos ?? []).filter((p: any) => isDeliverable(p));

  // Batch signed-URL creation per bucket — one round-trip instead of one call
  // per photo (a 50-photo gallery was 50 sequential signing requests).
  const byBucket = new Map<string, any[]>();
  for (const p of deliverable) {
    const arr = byBucket.get(p.bucket) ?? [];
    arr.push(p);
    byBucket.set(p.bucket, arr);
  }
  const urlByPath = new Map<string, string>();
  if (!pay.active) {
    // Only sign the clean masters when the order is unlocked (or the paywall is
    // off). Locked orders never produce a signed original.
    await Promise.all(
      Array.from(byBucket.entries()).map(async ([bucket, ps]) => {
        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrls(ps.map((p) => p.storage_path), 3600);
        for (const row of data ?? []) {
          if (row.signedUrl && row.path) urlByPath.set(row.path, row.signedUrl);
        }
      })
    );
  }

  const signed = deliverable.map((p: any) => ({
    id: p.id,
    filename: p.filename,
    width: p.width,
    height: p.height,
    room_type: p.room_type ?? null,
    url: pay.active
      ? `/api/delivery/${params.token}/preview/${p.id}`
      : urlByPath.get(p.storage_path) ?? null,
  }));

  // Rich-media deliverables (video / 360 tour / floor plan) published for this
  // listing. This endpoint is public, so we filter is_published EXPLICITLY —
  // the admin client bypasses the RLS that guards the logged-in portal view.
  // File URLs are signed; external URLs get an embeddable src where possible.
  const { data: dvRows } = await supabase
    .from('listing_deliverables')
    .select('id, kind, title, source, external_url, bucket, storage_path, filename, mime_type')
    .eq('listing_id', order.listing_id)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const deliverables = await Promise.all(
    (dvRows ?? []).map(async (d: any) => {
      let url: string | null = d.external_url ?? null;
      if (d.source === 'file' && d.bucket && d.storage_path) {
        const { data } = await supabase.storage.from(d.bucket).createSignedUrl(d.storage_path, 3600);
        url = data?.signedUrl ?? null;
      }
      return {
        id: d.id,
        kind: d.kind,
        title: d.title,
        source: d.source,
        url,
        embedUrl: d.source === 'url' && d.external_url ? toEmbedUrl(d.external_url) : null,
        mime: d.mime_type,
        filename: d.filename,
      };
    })
  );

  return NextResponse.json({
    order: { id: order.id, order_number: order.order_number },
    listing,
    photos: signed,
    deliverables,
    paywall: {
      active: pay.active,
      paid: pay.paid,
      price_cents: pay.priceCents,
      currency: pay.currency,
    },
  });
}

async function getCount(supabase: ReturnType<typeof createAdminClient>, id: string, col: string) {
  const { data } = await supabase.from('delivery_links').select(col).eq('id', id).single();
  return (data as any)?.[col] ?? 0;
}
