import archiver from 'archiver';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { buildExportName } from '@/lib/external-edit/manifest';

export const dynamic = 'force-dynamic';

/**
 * Streams a zip of an order's selected originals (raw + bracket frames),
 * sequence-named for a clean upload into Fotello. Prefers the untouched RAW
 * (raw_storage_path) when one exists — Fotello merges brackets from RAW.
 */
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get('order_id');
  if (!orderId) return new Response('order_id required', { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, order_number')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return new Response('Not found', { status: 404 });

  const { data: photos } = await admin
    .from('photos')
    .select('id, filename, bucket, storage_path, raw_storage_path')
    .eq('order_id', orderId)
    .in('kind', ['raw', 'bracket_member'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!photos?.length) return new Response('No originals to export', { status: 404 });

  const stream = new ReadableStream({
    async start(controller) {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => controller.enqueue(chunk));
      archive.on('end', () => controller.close());
      archive.on('error', (e) => controller.error(e));

      let seq = 0;
      for (const p of photos as any[]) {
        const path = p.raw_storage_path || p.storage_path;
        const { data } = await admin.storage.from(p.bucket).download(path);
        if (!data) continue;
        seq += 1;
        const actualExt = path.split('.').pop()?.toLowerCase() || 'jpg';
        const name =
          buildExportName(order.order_number, seq, p.filename).replace(/\.[^.]+$/, '') +
          '.' +
          actualExt;
        archive.append(Buffer.from(await data.arrayBuffer()), { name });
      }
      archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="ob${order.order_number}-originals.zip"`,
    },
  });
}
