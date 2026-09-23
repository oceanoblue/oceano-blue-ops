import archiver from 'archiver';
import { deliveryFilename } from '@/lib/photos/order';
import { createClient } from '@/lib/supabase/server';
import { paywallFor } from '@/lib/payments/gate';
import { isDeliverable } from '@/lib/photos/deliverable';

export const dynamic = 'force-dynamic';

/**
 * Stream a zip of the client's own delivered photos for a listing.
 * RLS handles authorization — clients only see their own rows.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const listingId = url.searchParams.get('listing_id');
  if (!listingId) return new Response('listing_id required', { status: 400 });
  const { data: clientIds, error: clientError } = await supabase.rpc('current_client_ids');
  if (clientError) return new Response('Unable to verify access', { status: 503 });
  if (!clientIds?.length) return new Response('Forbidden', { status: 403 });

  const { data: orders, error: orderError } = await supabase
    .from('orders')
    .select('id, total_cents, download_paid_at')
    .eq('listing_id', listingId)
    .in('client_id', clientIds);
  if (orderError) return new Response('Unable to verify payment', { status: 503 });
  if (!orders?.length) return new Response('No orders', { status: 404 });
  const orderIds = orders.filter(o => !paywallFor(o).active).map(o => o.id);
  if (!orderIds.length) return new Response('Payment required to download these files.', { status: 402 });

  const { data: photos, error: photoError } = await supabase
    .from('photos')
    .select('filename, bucket, storage_path, is_hdr, ai_provider')
    .in('order_id', orderIds)
    .in('kind', ['processed', 'delivered'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true });
  if (photoError) return new Response('Unable to load photos', { status: 503 });
  const downloadable = (photos ?? []).filter(isDeliverable);
  if (!downloadable.length) return new Response('No downloadable photos', { status: 404 });

  const stream = new ReadableStream({
    async start(controller) {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => controller.enqueue(chunk));
      archive.on('end', () => controller.close());
      archive.on('error', (e) => controller.error(e));
      for (const [index, p] of downloadable.entries()) {
        const { data } = await supabase.storage.from((p as any).bucket).download((p as any).storage_path);
        if (data) archive.append(Buffer.from(await data.arrayBuffer()), { name: deliveryFilename(p.filename, index, downloadable.length) });
      }
      archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'cache-control': 'private, no-store',
      'content-disposition': `attachment; filename="listing-${listingId}.zip"`,
    },
  });
}
