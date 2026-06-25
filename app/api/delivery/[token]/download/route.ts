import archiver from 'archiver';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeliverable } from '@/lib/photos/deliverable';

export const dynamic = 'force-dynamic';

// Client-selectable delivery resolutions. "full" ships the original finals
// untouched; "print" and "web" are resized derivatives generated on the fly.
const SIZE_PRESETS: Record<string, { longEdge: number; quality: number; suffix: string }> = {
  // 4K floor: the standard high-quality deliverable. 4096px long edge at q95 —
  // big enough for premium web/portal use and large screens, smaller than the
  // full-res master. Pairs with the untouched "full" (native master) download.
  '4k': { longEdge: 4096, quality: 95, suffix: '-4k' },
  // Print: large long edge at high quality — good for flyers, brochures, large
  // prints. Roughly 3000px keeps it sharp at A4/letter without shipping the
  // full-res master.
  print: { longEdge: 3000, quality: 92, suffix: '-print' },
  // Web: MLS / portal-friendly long edge + quality.
  web: { longEdge: 2048, quality: 85, suffix: '-web' },
};

/**
 * Streams a zip of all selected delivered photos for the order.
 *   ?size=4k    → each photo resized to 4096px long edge JPEG q95 (standard hi-res)
 *   ?size=print → each photo resized to 3000px long edge JPEG q92 (print)
 *   ?size=web   → each photo resized to 2048px long edge JPEG q85 (MLS upload)
 *   default     → full-resolution native masters
 *
 * For very large galleries you'll want to pre-build the zip and serve via
 * signed URL instead; this works fine for the typical 30-50 photo listing.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const sizeParam = new URL(req.url).searchParams.get('size') ?? '';
  const preset = SIZE_PRESETS[sizeParam];
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
    .select('filename, bucket, storage_path, is_hdr, ai_provider')
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

      for (const p of ((photos ?? []) as any[]).filter(isDeliverable)) {
        const { data } = await supabase.storage.from(p.bucket).download(p.storage_path);
        if (!data) continue;
        let bytes: Buffer = Buffer.from(await data.arrayBuffer());
        let name = p.filename;
        if (preset) {
          try {
            bytes = await sharp(bytes)
              .rotate()
              .resize({ width: preset.longEdge, height: preset.longEdge, fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: preset.quality, mozjpeg: true })
              .toBuffer();
            name = p.filename.replace(/\.[^.]+$/, '') + preset.suffix + '.jpg';
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
      'content-disposition': `attachment; filename="oceanoblue-${params.token}${preset ? preset.suffix : ''}.zip"`,
    },
  });
}

async function getCount(supabase: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await supabase.from('delivery_links').select('download_count').eq('id', id).single();
  return (data as any)?.download_count ?? 0;
}
