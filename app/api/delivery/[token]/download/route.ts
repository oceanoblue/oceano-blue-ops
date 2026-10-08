import { createAdminClient } from '@/lib/supabase/server';
import { isDeliverable } from '@/lib/photos/deliverable';
import { paywallFor } from '@/lib/payments/gate';
import { createPhotoArchive, archiveWebStream, ARCHIVE_PRESETS, type ArchiveSize } from '@/lib/deliveries/photo-archive';
import { ArchiveBusyError, preparedArchiveResponse } from '@/lib/deliveries/prepared-archive';
import { prepareArchiveSet, archiveSources } from '@/lib/deliveries/archive-set';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Prepared downloads are complete verified objects. Legacy links use bounded
 * streams. Every path checks token, expiry, payment and selected deliverables. */
export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const query = new URL(req.url).searchParams;
  const size = query.get('size') || 'full';
  if (!['full', '4k', 'print', 'web'].includes(size)) return new Response('Invalid download resolution.', { status: 400 });
  const archiveSize = size as ArchiveSize;
  const preset = archiveSize === 'full' ? null : ARCHIVE_PRESETS[archiveSize];
  const supabase = createAdminClient({ noStore: true });
  const { data: link } = await supabase.from('delivery_links')
    .select('id, order_id, expires_at').eq('token', token).single();
  if (!link) return new Response('Not found', { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return new Response('Expired', { status: 410 });

  const { data: order } = await supabase.from('orders')
    .select('total_cents, download_paid_at').eq('id', link.order_id).single();
  if (paywallFor(order as any).active) return new Response('Payment required to download this gallery.', { status: 402 });
  const { data: photos, error } = await supabase.from('photos')
    .select('id, filename, bucket, storage_path, updated_at, is_hdr, ai_provider, byte_size')
    .eq('order_id', link.order_id).in('kind', ['processed', 'delivered']).eq('is_selected', true)
    .order('sort_order', { ascending: true }).order('id', { ascending: true });
  if (error) return new Response('Photos are temporarily unavailable.', { status: 503 });
  const downloadable = ((photos ?? []) as any[]).filter(isDeliverable);
  if (!downloadable.length) return new Response('No delivered photos are available.', { status: 422 });
  const filename = `oceanoblue-${token}${preset ? preset.suffix : ''}.zip`;

  if (query.has('archive')) return preparedArchiveResponse(supabase, archiveSources(downloadable), link.order_id, archiveSize, filename, req);

  if (query.get('prepare') === '1') {
    try {
      const ready = await prepareArchiveSet(supabase, downloadable, link.order_id, archiveSize, filename);
      const url = new URL(req.url);
      url.searchParams.delete('prepare');
      url.searchParams.set('archive', ready.archiveKey);
      return Response.json({ ...ready, downloadUrl: url.toString() }, { headers: { 'cache-control': 'no-store' } });
    } catch (cause) {
      const busy = cause instanceof ArchiveBusyError;
      console.error(JSON.stringify({ scope: 'gallery.archive', event: 'failed', size, busy }));
      return Response.json({ error: busy ? cause.message : 'We could not prepare a complete ZIP. Please try again or contact our team. No partial download was delivered.' },
        { status: busy ? 429 : 503, headers: { 'cache-control': 'no-store', 'retry-after': '10' } });
    }
  }

  const zip = createPhotoArchive(downloadable, archiveSize, async photo => {
    const { data, error: downloadError } = await supabase.storage.from(photo.bucket).download(photo.storage_path);
    if (downloadError || !data) throw new Error('A delivered photo could not be retrieved.');
    return data;
  }, AbortSignal.any([req.signal, AbortSignal.timeout(240_000)]));
  void zip.done.then(async result => {
    console.info(JSON.stringify({ scope: 'gallery.archive', event: 'stream_complete', size, ...result,
      rssMiB: Math.round(process.memoryUsage().rss / 1048576) }));
    const { data } = await supabase.from('delivery_links').select('download_count').eq('id', link.id).single();
    await supabase.from('delivery_links').update({ download_count: ((data as any)?.download_count ?? 0) + 1 }).eq('id', link.id);
  }).catch(() => console.error(JSON.stringify({ scope: 'gallery.archive', event: 'stream_failed', size })));
  return new Response(archiveWebStream(zip.archive), { headers: {
    'content-type': 'application/zip', 'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  } });
}
