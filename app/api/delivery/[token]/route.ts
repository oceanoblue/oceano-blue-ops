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
    .select('id, filename, bucket, storage_path, width, height, sort_order, is_hdr, ai_provider')
    .eq('order_id', order.id)
    .in('kind', ['processed', 'delivered'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true });

  const deliverable = (photos ?? []).filter((p: any) => isDeliverable(p));
  const signed = await Promise.all(
    deliverable.map(async (p: any) => {
      const { data } = await supabase.storage
        .from(p.bucket)
        .createSignedUrl(p.storage_path, 3600);
      return {
        id: p.id,
        filename: p.filename,
        width: p.width,
        height: p.height,
        url: data?.signedUrl ?? null,
      };
    })
  );

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
