import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { detectAssetBracketGroups, type AssetLike } from '@/lib/photos/asset-bracket-detect';
import { listFolder, isDropboxConfigured } from '@/lib/integrations/dropbox';

export const dynamic = 'force-dynamic';

/**
 * Cloud photo pipeline — process an order's photos straight from its Dropbox
 * intake folder through the AI pipeline. No NAS, no manual review, and NO photo
 * rows for the inputs: the bracket's Dropbox file list travels in the ai_job's
 * params (dropbox_inputs), so the runner pulls the RAWs directly and nothing
 * collides with the order's photo-manager / raw-cleanup lifecycle. Only the
 * enhanced OUTPUT lands in `photos` (processed-photos) → gallery.
 */

const RAW_EXTS = new Set(['cr3', 'cr2', 'arw', 'nef', 'raf', 'rw2', 'dng', 'orf', 'srw', 'pef', 'raw', 'tif', 'tiff', 'jpg', 'jpeg']);
const ext = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

// Anchored on the ORDER (job_id accepted for back-compat, resolved to its order).
const Body = z
  .object({ order_id: z.string().uuid().optional(), job_id: z.string().uuid().optional() })
  .refine((b) => b.order_id || b.job_id, { message: 'order_id or job_id required' });

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: isTeam } = await supabase.rpc('is_team_member');
  if (!isTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!isDropboxConfigured()) return NextResponse.json({ error: 'dropbox_not_configured', message: 'Dropbox is not configured on the server.' }, { status: 400 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  const { order_id, job_id } = parsed.data;

  const admin = createAdminClient() as any;

  let q = admin.from('orders').select('id, dropbox_intake_path');
  q = order_id
    ? q.eq('id', order_id)
    : q.eq('job_id', job_id).not('dropbox_intake_path', 'is', null).order('created_at', { ascending: false }).limit(1);
  const { data: order } = await q.maybeSingle();
  if (!order?.dropbox_intake_path) {
    return NextResponse.json({ error: 'no_intake_folder', message: 'This order has no Dropbox upload link yet — create it on the order first.' }, { status: 400 });
  }

  const listing = await listFolder(order.dropbox_intake_path);
  if (listing.status === 'not_found') return NextResponse.json({ error: 'intake_folder_missing', message: 'The Dropbox intake folder does not exist yet — nothing has been uploaded.' }, { status: 404 });
  if (listing.status !== 'ok') return NextResponse.json({ error: (listing as any).error ?? listing.status }, { status: 500 });

  const photoFiles = listing.files.filter((f) => RAW_EXTS.has(ext(f.name)));
  if (photoFiles.length === 0) return NextResponse.json({ ok: true, queued: 0, message: 'No photo files in the intake folder yet.' });

  // Dedup against jobs already queued/run for this order (by Dropbox path in
  // params). Failed jobs are excluded so a fresh Process re-covers them.
  const { data: existingJobs } = await admin.from('ai_jobs').select('params').eq('order_id', order.id).neq('status', 'failed');
  const covered = new Set<string>();
  for (const j of existingJobs ?? []) {
    for (const di of ((j.params as any)?.dropbox_inputs ?? [])) if (di?.path) covered.add(di.path);
  }
  const fresh = photoFiles.filter((f) => !covered.has(f.path_lower));
  if (fresh.length === 0) return NextResponse.json({ ok: true, queued: 0, message: 'All files in the intake folder are already processed or queued.' });

  // Group brackets by filename-run + size (inputs travel in params, no photo rows).
  const assetLikes: AssetLike[] = fresh.map((f) => ({ id: f.path_lower, filename: f.name, byte_size: f.size ?? 0, exif: {} }));
  const detection = detectAssetBracketGroups(assetLikes);
  const byPath = new Map(fresh.map((f) => [f.path_lower, f]));
  const toInput = (id: string) => { const f = byPath.get(id)!; return { path: f.path_lower, filename: f.name }; };

  const base = { order_id: order.id, provider: 'oceano-enhance', input_photo_ids: [] as string[], prompt: null, status: 'pending', created_by: user.id };
  const jobs: any[] = [];
  for (const g of detection.groups) {
    jobs.push({ ...base, job_type: 'hdr_merge', params: { force_auto_enhance: true, auto_chain_fixes: true, source: 'dropbox_cloud', dropbox_inputs: g.assetIds.map(toInput) } });
  }
  for (const id of detection.singleAssetIds) {
    jobs.push({ ...base, job_type: 'enhance_single', params: { force_auto_enhance: true, auto_chain_fixes: true, source: 'dropbox_cloud', dropbox_inputs: [toInput(id)] } });
  }

  const { data: inserted, error: jobErr } = await admin.from('ai_jobs').insert(jobs).select('id');
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });

  await admin.from('orders').update({ status: 'processing' }).eq('id', order.id);

  // Kick the drain (self-chains until the queue empties). Fire-and-forget.
  const kickBase = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  const secret = process.env.CRON_SECRET;
  if (kickBase && secret) {
    const url = kickBase.startsWith('http') ? kickBase : `https://${kickBase}`;
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
