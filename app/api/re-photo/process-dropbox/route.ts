import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { detectAssetBracketGroups, type AssetLike } from '@/lib/photos/asset-bracket-detect';
import { listFolder, isDropboxConfigured } from '@/lib/integrations/dropbox';

export const dynamic = 'force-dynamic';

/**
 * Cloud photo pipeline P2 — process a job's photos straight from its Dropbox
 * intake folder through the AI pipeline. No NAS, no manual bracket review:
 *   list Dropbox → group brackets (filename+size) → create Dropbox-referenced
 *   `photos` rows → enqueue ai_jobs → kick the cron drain.
 * The runner pulls each RAW from Dropbox, runs the worker-edit HDR merge, then
 * (forced here) the Nano Banana Pro enhance, and uploads to processed-photos.
 */

const RAW_EXTS = new Set(['cr3', 'cr2', 'arw', 'nef', 'raf', 'rw2', 'dng', 'orf', 'srw', 'pef', 'raw', 'tif', 'tiff', 'jpg', 'jpeg']);
const ext = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

const Body = z.object({ job_id: z.string().uuid() });

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isDropboxConfigured()) return NextResponse.json({ error: 'dropbox_not_configured', message: 'Dropbox is not configured on the server.' }, { status: 400 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  const { job_id } = parsed.data;

  const admin = createAdminClient() as any;

  // The order for this job carries the Dropbox intake path and is the ai_jobs scope.
  const { data: order } = await admin
    .from('orders')
    .select('id, dropbox_intake_path')
    .eq('job_id', job_id)
    .not('dropbox_intake_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order?.dropbox_intake_path) {
    return NextResponse.json({ error: 'no_intake_folder', message: 'This job has no Dropbox intake folder yet — create the upload link on the order first.' }, { status: 400 });
  }

  const listing = await listFolder(order.dropbox_intake_path);
  if (listing.status === 'not_found') return NextResponse.json({ error: 'intake_folder_missing', message: 'The Dropbox intake folder does not exist yet — nothing has been uploaded.' }, { status: 404 });
  if (listing.status !== 'ok') return NextResponse.json({ error: (listing as any).error ?? listing.status }, { status: 500 });

  const photoFiles = listing.files.filter((f) => RAW_EXTS.has(ext(f.name)));
  if (photoFiles.length === 0) return NextResponse.json({ ok: true, queued: 0, message: 'No photo files in the intake folder yet.' });

  // Skip files already imported to photos for this order (by dropbox_path).
  const { data: existing } = await admin.from('photos').select('dropbox_path').eq('order_id', order.id).not('dropbox_path', 'is', null);
  const seenPaths = new Set((existing ?? []).map((p: any) => p.dropbox_path));
  const fresh = photoFiles.filter((f) => !seenPaths.has(f.path_lower));
  if (fresh.length === 0) return NextResponse.json({ ok: true, queued: 0, message: 'All files in the intake folder are already processed or queued.' });

  // Pre-generate photo ids so we can group + enqueue without a round-trip.
  const photoRows = fresh.map((f) => ({
    id: randomUUID(),
    order_id: order.id,
    kind: 'raw',
    filename: f.name,
    // Dropbox-resident RAW: storage_path is a non-null sentinel (never downloaded —
    // the runner branches on dropbox_path); bucket keeps its default.
    storage_path: f.path_lower,
    bucket: 'raw-photos',
    dropbox_path: f.path_lower,
    mime_type: null,
    byte_size: f.size ?? 0,
    exif: {},
    processing_status: 'pending',
    uploaded_by: user.id,
  }));

  const { error: insErr } = await admin.from('photos').insert(photoRows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Group brackets by filename-run + size (no EXIF needed).
  const assetLikes: AssetLike[] = photoRows.map((p) => ({ id: p.id, filename: p.filename, byte_size: p.byte_size, exif: {} }));
  const detection = detectAssetBracketGroups(assetLikes);

  const jobs: any[] = [];
  // One hdr_merge per bracket group; force the Nano Banana enhance + scene chain.
  for (const g of detection.groups) {
    jobs.push({
      order_id: order.id,
      job_type: 'hdr_merge',
      provider: 'oceano-enhance',
      input_photo_ids: g.assetIds,
      prompt: null,
      status: 'pending',
      created_by: user.id,
      params: { force_auto_enhance: true, auto_chain_fixes: true, source: 'dropbox_cloud' },
    });
  }
  // Singles → deterministic engine enhance (RAW-capable). Nano Banana is applied
  // to merged bases; a lone frame gets the signature grade.
  for (const id of detection.singleAssetIds) {
    jobs.push({
      order_id: order.id,
      job_type: 'enhance_single',
      provider: 'oceano-enhance',
      input_photo_ids: [id],
      prompt: null,
      status: 'pending',
      created_by: user.id,
      params: { auto_chain_fixes: true, source: 'dropbox_cloud' },
    });
  }

  const { data: inserted, error: jobErr } = await admin.from('ai_jobs').insert(jobs).select('id');
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });

  await admin.from('orders').update({ status: 'processing' }).eq('id', order.id);

  // Kick the drain (self-chains until the queue empties). Fire-and-forget.
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  const secret = process.env.CRON_SECRET;
  if (base && secret) {
    const url = base.startsWith('http') ? base : `https://${base}`;
    fetch(`${url}/api/cron/run-pending-jobs`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    imported: fresh.length,
    queued: inserted?.length ?? 0,
    brackets: detection.groups.length,
    singles: detection.singleAssetIds.length,
  });
}
