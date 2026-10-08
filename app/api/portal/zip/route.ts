import { createPhotoArchive, archiveWebStream, type ArchiveSize } from '@/lib/deliveries/photo-archive';
import { prepareArchiveSet, archiveSources } from '@/lib/deliveries/archive-set';
import { ArchiveBusyError, preparedArchiveResponse } from '@/lib/deliveries/prepared-archive';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { paywallFor } from '@/lib/payments/gate';
import { isDeliverable } from '@/lib/photos/deliverable';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

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
  const size = url.searchParams.get('size') || 'full';
  if (!['full', 'web', 'print', '4k'].includes(size)) return new Response('Invalid download resolution.', { status: 400 });
  const archiveSize = size as ArchiveSize;
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
    .select('id, filename, bucket, storage_path, updated_at, is_hdr, ai_provider, byte_size')
    .in('order_id', orderIds)
    .in('kind', ['processed', 'delivered'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true }).order('id', { ascending: true });
  if (photoError) return new Response('Unable to load photos', { status: 503 });
  const downloadable = (photos ?? []).filter(isDeliverable);
  if (!downloadable.length) return new Response('No downloadable photos', { status: 404 });

  const filename = `listing-${listingId}${size === 'full' ? '' : `-${size}`}.zip`;
  // The privileged archive cache is used only after user, client, payment and
  // selected-photo checks above; repeat those checks on the final download.
  if (url.searchParams.has('archive') || url.searchParams.get('prepare') === '1') {
    const admin = createAdminClient({ noStore: true });
    const folder = `listing-${listingId}`;
    if (url.searchParams.has('archive')) return preparedArchiveResponse(admin, archiveSources(downloadable), folder, archiveSize, filename, request);
    try {
      const ready = await prepareArchiveSet(admin, downloadable, folder, archiveSize, filename);
      url.searchParams.delete('prepare'); url.searchParams.set('archive', ready.archiveKey);
      return Response.json({ ...ready, downloadUrl: url.toString() }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: 'Could not prepare the complete ZIP. Please try again.' }, { status: error instanceof ArchiveBusyError ? 429 : 503 });
    }
  }
  const zip = createPhotoArchive(downloadable, archiveSize, async photo => {
    const { data, error } = await supabase.storage.from(photo.bucket).download(photo.storage_path);
    if (error || !data) throw new Error('A delivered photo could not be retrieved.');
    return data;
  }, AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]));
  return new Response(archiveWebStream(zip.archive), { headers: {
    'content-type': 'application/zip', 'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename="${filename}"`,
  } });
}
