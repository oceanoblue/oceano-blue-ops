import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeliverable } from '@/lib/photos/deliverable';

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
    .select('id, order_number, listing_id, client_id')
    .eq('id', link.order_id)
    .single();
  if (!order) return NextResponse.json({ error: 'order_missing' }, { status: 404 });

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

  const signed = deliverable.map((p: any) => ({
    id: p.id,
    filename: p.filename,
    width: p.width,
    height: p.height,
    room_type: p.room_type ?? null,
    url: urlByPath.get(p.storage_path) ?? null,
  }));

  return NextResponse.json({
    order: { id: order.id, order_number: order.order_number },
    listing,
    photos: signed,
  });
}

async function getCount(supabase: ReturnType<typeof createAdminClient>, id: string, col: string) {
  const { data } = await supabase.from('delivery_links').select(col).eq('id', id).single();
  return (data as any)?.[col] ?? 0;
}
