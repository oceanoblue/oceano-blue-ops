import archiver from 'archiver';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Stream a zip of the client's own delivered photos for a listing.
 * RLS handles authorization — clients only see their own rows.
 */
export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const listingId = url.searchParams.get('listing_id');
  if (!listingId) return new Response('listing_id required', { status: 400 });

  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('listing_id', listingId);
  const orderIds = (orders ?? []).map((o: any) => o.id);
  if (!orderIds.length) return new Response('No orders', { status: 404 });

  const { data: photos } = await supabase
    .from('photos')
    .select('filename, bucket, storage_path')
    .in('order_id', orderIds)
    .in('kind', ['processed', 'delivered'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true });

  const stream = new ReadableStream({
    async start(controller) {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => controller.enqueue(chunk));
      archive.on('end', () => controller.close());
      archive.on('error', (e) => controller.error(e));
      for (const p of photos ?? []) {
        const { data } = await supabase.storage.from((p as any).bucket).download((p as any).storage_path);
        if (data) archive.append(Buffer.from(await data.arrayBuffer()), { name: (p as any).filename });
      }
      archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="listing-${listingId}.zip"`,
    },
  });
}
