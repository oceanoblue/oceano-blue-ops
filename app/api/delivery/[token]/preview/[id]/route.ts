import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Watermarked, downscaled preview of a single delivered photo. This is what the
 * gallery shows while an order is LOCKED (unpaid): the full-resolution master
 * never leaves the server, and every pixel that does is stamped with a tiled
 * "OCEANO BLUE" watermark — so screenshots carry the mark and the clean file is
 * only obtainable after payment.
 */
function watermarkSvg(w: number, h: number): string {
  // Denser, higher-contrast tiling. The thin dark stroke keeps the white mark
  // legible over both bright and dark photos.
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="wm" width="300" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="100" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="800"
            fill="#ffffff" fill-opacity="0.46" stroke="#0b1220" stroke-opacity="0.14" stroke-width="0.7"
            letter-spacing="6">OCEANO BLUE</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)"/>
</svg>`;
}

export async function GET(_req: Request, { params }: { params: { token: string; id: string } }) {
  const supabase = createAdminClient();

  const { data: link } = await supabase
    .from('delivery_links')
    .select('order_id, expires_at')
    .eq('token', params.token)
    .single();
  if (!link) return new Response('Not found', { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return new Response('Expired', { status: 410 });
  }

  // The photo must belong to this order and be a real deliverable — the token
  // can only surface its own order's images.
  const { data: photo } = await supabase
    .from('photos')
    .select('bucket, storage_path')
    .eq('id', params.id)
    .eq('order_id', link.order_id)
    .in('kind', ['processed', 'delivered'])
    .maybeSingle();
  if (!photo) return new Response('Not found', { status: 404 });

  const { data: file } = await supabase.storage.from((photo as any).bucket).download((photo as any).storage_path);
  if (!file) return new Response('Not found', { status: 404 });

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const base = await sharp(input)
      .rotate()
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    const meta = await sharp(base).metadata();
    const w = meta.width ?? 1400;
    const h = meta.height ?? 1400;
    const out = await sharp(base)
      .composite([{ input: Buffer.from(watermarkSvg(w, h)), top: 0, left: 0 }])
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();

    return new Response(new Uint8Array(out), {
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Preview failed', { status: 500 });
  }
}
