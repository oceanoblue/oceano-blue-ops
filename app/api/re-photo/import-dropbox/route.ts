import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { detectAssetBracketGroups, type AssetLike } from '@/lib/photos/asset-bracket-detect';
import { heuristicScene } from '@/lib/photos/scene';
import { listFolder, isDropboxConfigured } from '@/lib/integrations/dropbox';

export const dynamic = 'force-dynamic';

/**
 * Real Estate Photo Rescue — import a job's photos straight from its Dropbox
 * intake folder (the per-order file-request destination). Replaces the old
 * "Dropbox desktop-sync to the office Mac, then local worker scans" step: the
 * server lists the folder and registers each RAW as an `assets` row carrying a
 * durable Dropbox reference (metadata.dropbox_path/id) so the cloud worker can
 * pull the bytes later. Bracket grouping runs over filename + size here; the
 * worker enriches with full EXIF when it downloads the files (P2).
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

  const { data: job } = await admin.from('jobs').select('id, project_id').eq('id', job_id).maybeSingle();
  if (!job) return NextResponse.json({ error: 'job_not_found' }, { status: 404 });

  // The order for this job carries the Dropbox intake folder path.
  const { data: order } = await admin
    .from('orders')
    .select('id, order_number, dropbox_intake_path')
    .eq('job_id', job_id)
    .not('dropbox_intake_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order?.dropbox_intake_path) {
    return NextResponse.json({ error: 'no_intake_folder', message: 'This job has no Dropbox intake folder yet — create the upload link on the order first.' }, { status: 400 });
  }

  const listing = await listFolder(order.dropbox_intake_path);
  if (listing.status === 'not_found') {
    return NextResponse.json({ error: 'intake_folder_missing', message: 'The Dropbox intake folder does not exist yet — nothing has been uploaded.' }, { status: 404 });
  }
  if (listing.status !== 'ok') {
    return NextResponse.json({ error: (listing as any).error ?? listing.status }, { status: 500 });
  }

  const photoFiles = listing.files.filter((f) => RAW_EXTS.has(ext(f.name)));
  if (photoFiles.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, assets: 0, groups: 0, message: 'No photo files in the intake folder yet.' });
  }

  // Skip anything already imported for this job (by Dropbox id, then filename).
  const { data: existing } = await admin.from('assets').select('filename, metadata').eq('job_id', job_id);
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const a of existing ?? []) {
    if (a.metadata?.dropbox_id) seenIds.add(a.metadata.dropbox_id);
    if (a.filename) seenNames.add(a.filename);
  }
  const fresh = photoFiles.filter((f) => !seenIds.has(f.id) && !seenNames.has(f.name));
  if (fresh.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, assets: 0, groups: 0, message: 'All files in the intake folder are already imported.' });
  }

  const startedAt = new Date().toISOString();

  const assetRows = fresh.map((f) => {
    const assetLike: AssetLike = { id: 'x', filename: f.name, exif: {} };
    const scene = heuristicScene(assetLike);
    return {
      id: randomUUID(),
      job_id,
      project_id: job.project_id ?? null,
      asset_type: 'source',
      media_type: 'photo',
      status: 'indexed',
      filename: f.name,
      byte_size: f.size ?? 0,
      captured_at: f.client_modified ?? null,
      exif: {},
      // Durable Dropbox reference — the cloud worker resolves a temp link from this.
      metadata: {
        source: 're_photo_dropbox',
        dropbox_path: f.path_lower,
        dropbox_id: f.id,
        is_drone: scene === 'drone',
        scene,
        scene_source: 'heuristic',
      },
      created_by: user.id,
    };
  });

  const { error: insErr } = await admin.from('assets').insert(assetRows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Bracket grouping (filename-run + size; worker adds EXIF later).
  const assetLikes: AssetLike[] = assetRows.map((a) => ({ id: a.id, filename: a.filename, byte_size: a.byte_size, exif: a.exif }));
  const detection = detectAssetBracketGroups(assetLikes);

  let needsReview = 0;
  for (const g of detection.groups) {
    if (g.reviewRequired) needsReview++;
    const { data: grp, error: gErr } = await admin
      .from('asset_groups')
      .insert({
        job_id,
        group_type: 'real_estate_bracket',
        name: `${g.size}-shot bracket`,
        confidence_score: g.confidence,
        review_required: g.reviewRequired,
        metadata: { method: g.method, reason: g.reason, detected_size: g.size },
      })
      .select('id')
      .single();
    if (gErr || !grp) continue;

    const items = g.assetIds.map((assetId, idx) => ({ group_id: grp.id, asset_id: assetId, role: g.roles[assetId] ?? null, sort_order: idx }));
    await admin.from('asset_group_items').insert(items);
    await admin.from('assets').update({ status: 'grouped' }).in('id', g.assetIds);
  }

  const completedAt = new Date().toISOString();
  const summary = { assets: assetRows.length, groups: detection.groups.length, needs_review: needsReview, singles: detection.singleAssetIds.length };

  await admin.from('worker_tasks').insert({
    job_id, task_type: 'scan_folder', status: 'completed',
    payload: { file_count: fresh.length, source: 'dropbox', path: order.dropbox_intake_path },
    result: summary, started_at: startedAt, completed_at: completedAt,
  });
  await admin.from('tool_runs').insert({
    job_id, tool_type: 'local_worker', provider: 'bracket_detection', status: 'completed',
    input: { file_count: fresh.length, source: 'dropbox' }, output: summary,
    started_at: startedAt, completed_at: completedAt, created_by: user.id,
  });
  await admin.from('production_events').insert([
    { job_id, project_id: job.project_id ?? null, actor_type: 'user', actor_id: user.id, event_type: 'folder_scanned', summary: `Imported ${fresh.length} files from Dropbox`, details: { path: order.dropbox_intake_path, ...summary } },
    { job_id, project_id: job.project_id ?? null, actor_type: 'system', event_type: 'assets_indexed', summary: `Indexed ${summary.assets} assets`, details: summary },
    { job_id, project_id: job.project_id ?? null, actor_type: 'system', event_type: 'brackets_detected', summary: `${summary.groups} bracket groups, ${summary.needs_review} need review`, details: summary },
  ]);

  await admin
    .from('jobs')
    .update({ status: 'in_progress', next_action: needsReview > 0 ? `Review ${needsReview} uncertain bracket group(s)` : 'Run delivery QC' })
    .eq('id', job_id)
    .in('status', ['intake', 'scheduled', 'media_received', 'ingesting']);

  return NextResponse.json({ ok: true, imported: fresh.length, ...summary });
}
