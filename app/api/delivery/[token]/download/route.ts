import archiver from 'archiver';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Streams a zip of all selected delivered photos for the order.
 *
 * For very large galleries you'll want to pre-build the zip and serve via
 * signed URL instead; this works fine for the typical 30-50 photo listing.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  const { data: link } = await supabase
    .from('delivery_links')
    .select('id, order_id, expires_at')
    .eq('token', params.token)
    .single();
  if (!link) return new Response('Not found', { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return new Response('Expired', { status: 410 });
  }

  const { data: photos } = await supabase
    .from('photos')
    .select('filename, bucket, storage_path')
    .eq('order_id', link.order_id)
    .in('kind', ['processed', 'delivered'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true });

  await supabase
    .from('delivery_links')
    .update({ download_count: ((await getCount(supabase, link.id)) + 1) })
    .eq('id', link.id);

  const stream = new ReadableStream({
    async start(controller) {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => controller.enqueue(chunk));
      archive.on('end', () => controller.close());
      archive.on('error', (e) => controller.error(e));

      for (const p of photos ?? []) {
        const { data } = await supabase.storage.from(p.bucket).download(p.storage_path);
        if (data) {
          archive.append(Buffer.from(await data.arrayBuffer()), { name: p.filename });
        }
      }
      archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="oceanoblue-${params.token}.zip"`,
    },
  });
}

async function getCount(supabase: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await supabase.from('delivery_links').select('download_count').eq('id', id).single();
  return (data as any)?.download_count ?? 0;
}
