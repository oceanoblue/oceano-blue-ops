import archiver from 'archiver';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// "Download for Web" size: MLS/portal-friendly long edge + quality.
const WEB_LONG_EDGE = 2048;
const WEB_QUALITY = 85;

/**
 * Streams a zip of all selected delivered photos for the order.
 *   ?size=web → each photo resized to 2048px long edge JPEG q85 (MLS upload)
 *   default   → full-size originals
 *
 * For very large galleries you'll want to pre-build the zip and serve via
 * signed URL instead; this works fine for the typical 30-50 photo listing.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const wantsWeb = new URL(req.url).searchParams.get('size') === 'web';
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

      for (const p of (photos ?? []) as any[]) {
        const { data } = await supabase.storage.from(p.bucket).download(p.storage_path);
        if (!data) continue;
        let bytes: Buffer = Buffer.from(await data.arrayBuffer());
        let name = p.filename;
        if (wantsWeb) {
          try {
            bytes = await sharp(bytes)
              .rotate()
              .resize({ width: WEB_LONG_EDGE, height: WEB_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: WEB_QUALITY, mozjpeg: true })
              .toBuffer();
            name = p.filename.replace(/\.[^.]+$/, '') + '-web.jpg';
          } catch {
            // Fall back to the original bytes rather than dropping the photo.
          }
        }
        archive.append(bytes, { name });
      }
      archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="oceanoblue-${params.token}${wantsWeb ? '-web' : ''}.zip"`,
    },
  });
}

async function getCount(supabase: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await supabase.from('delivery_links').select('download_count').eq('id', id).single();
  return (data as any)?.download_count ?? 0;
}
