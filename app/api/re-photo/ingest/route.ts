import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { detectAssetBracketGroups, type AssetLike } from '@/lib/photos/asset-bracket-detect';
import { heuristicScene } from '@/lib/photos/scene';

export const dynamic = 'force-dynamic';

/**
 * Real Estate Photo Rescue — ingest + bracket detection.
 *
 * Heavy media stays local (per the Production OS architecture): the browser
 * reads the folder, extracts EXIF client-side, and posts only metadata here.
 * We register every file as an `assets` row, run bracket detection over the
 * batch (reusing the existing detectors via lib/photos/asset-bracket-detect),
 * persist `asset_groups` + `asset_group_items` with confidence scores and
 * review flags, and log the work to tool_runs / worker_tasks /
 * production_events.
 */
const FileInput = z.object({
  filename: z.string().min(1),
  local_path: z.string().optional(),
  byte_size: z.number().int().nonnegative().optional().default(0),
  mime_type: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  captured_at: z.string().optional().nullable(),
  exif: z.record(z.any()).optional().default({}),
});

const Body = z.object({
  job_id: z.string().uuid(),
  files: z.array(FileInput).min(1),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { job_id, files } = parsed.data;

  const admin = createAdminClient() as any;

  // Confirm the job exists and grab its project for event logging.
  const { data: job } = await admin
    .from('jobs')
    .select('id, project_id')
    .eq('id', job_id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'job_not_found' }, { status: 404 });

  const startedAt = new Date().toISOString();

  // 1-3) Register every file as an asset (id generated here so we can correlate
  // with detection without a second round-trip).
  const assetRows = files.map((f) => {
    const assetLike: AssetLike = { id: 'x', filename: f.filename, exif: f.exif };
    const scene = heuristicScene(assetLike);
    return {
      id: randomUUID(),
      job_id,
      project_id: job.project_id ?? null,
      asset_type: 'source',
      media_type: 'photo',
      status: 'indexed',
      filename: f.filename,
      local_path: f.local_path ?? f.filename,
      mime_type: f.mime_type ?? null,
      width: f.width ?? null,
      height: f.height ?? null,
      byte_size: f.byte_size ?? 0,
      captured_at: f.captured_at ?? null,
      exif: f.exif ?? {},
      metadata: { source: 're_photo_ingest', is_drone: scene === 'drone', scene, scene_source: 'heuristic' },
      created_by: user.id,
    };
  });

  const { error: insErr } = await admin.from('assets').insert(assetRows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // 4-6) Detect bracket groups, score confidence, flag uncertain ones.
  const assetLikes: AssetLike[] = assetRows.map((a) => ({
    id: a.id,
    filename: a.filename,
    byte_size: a.byte_size,
    exif: a.exif,
  }));
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

    const items = g.assetIds.map((assetId, idx) => ({
      group_id: grp.id,
      asset_id: assetId,
      role: g.roles[assetId] ?? null,
      sort_order: idx,
    }));
    await admin.from('asset_group_items').insert(items);

    // Mark grouped assets so the UI can distinguish them from singles.
    await admin.from('assets').update({ status: 'grouped' }).in('id', g.assetIds);
  }

  const completedAt = new Date().toISOString();
  const summary = {
    assets: assetRows.length,
    groups: detection.groups.length,
    needs_review: needsReview,
    singles: detection.singleAssetIds.length,
  };

  // Observability: one worker_task (the scan) + one tool_run (the detection).
  await admin.from('worker_tasks').insert({
    job_id,
    task_type: 'scan_folder',
    status: 'completed',
    payload: { file_count: files.length },
    result: summary,
    started_at: startedAt,
    completed_at: completedAt,
  });
  await admin.from('tool_runs').insert({
    job_id,
    tool_type: 'local_worker',
    provider: 'bracket_detection',
    status: 'completed',
    input: { file_count: files.length },
    output: summary,
    started_at: startedAt,
    completed_at: completedAt,
    created_by: user.id,
  });

  await admin.from('production_events').insert([
    {
      job_id,
      project_id: job.project_id ?? null,
      actor_type: 'user',
      actor_id: user.id,
      event_type: 'folder_scanned',
      summary: `Scanned ${files.length} files`,
      details: { file_count: files.length },
    },
    {
      job_id,
      project_id: job.project_id ?? null,
      actor_type: 'system',
      event_type: 'assets_indexed',
      summary: `Indexed ${summary.assets} assets`,
      details: summary,
    },
    {
      job_id,
      project_id: job.project_id ?? null,
      actor_type: 'system',
      event_type: 'brackets_detected',
      summary: `${summary.groups} bracket groups, ${summary.needs_review} need review`,
      details: summary,
    },
  ]);

  // Advance the job once media has landed.
  await admin
    .from('jobs')
    .update({ status: 'in_progress', next_action: needsReview > 0 ? `Review ${needsReview} uncertain bracket group(s)` : 'Run delivery QC' })
    .eq('id', job_id)
    .in('status', ['intake', 'scheduled', 'media_received', 'ingesting']);

  return NextResponse.json({
    ok: true,
    ...summary,
    // Returned so the client can attach a thumbnail to each new asset.
    assets: assetRows.map((a) => ({ id: a.id, local_path: a.local_path, filename: a.filename })),
  });
}
