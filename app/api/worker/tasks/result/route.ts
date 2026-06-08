import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateWorker } from '@/lib/worker/auth';
import { mediaTypeFromExt } from '@/lib/worker/path-safety';
import { persistDetectedGroups } from '@/lib/photos/persist-bracket-groups';

export const dynamic = 'force-dynamic';

/**
 * Worker reports a task result. Server applies the side-effects (so storage +
 * DB writes stay server-side) and logs tool_runs + production_events.
 *  - scan_folder       → upsert `assets` (indexed) under a `storage_locations` row
 *  - generate_thumbnails → upload posted preview bytes to the private
 *    `thumbnails` bucket and set `assets.thumbnail_url`
 * Read-only on the worker's disk; no deletes/overwrites of source files anywhere.
 */
const Body = z.object({
  task_id: z.string().uuid(),
  status: z.enum(['completed', 'failed']),
  error: z.string().optional(),
  result: z.record(z.any()).optional(),
  storage_location: z
    .object({ name: z.string(), kind: z.string().default('local'), root_path: z.string().optional() })
    .optional(),
  files: z
    .array(
      z.object({
        filename: z.string(),
        local_path: z.string(),
        byte_size: z.number().int().nonnegative().optional(),
        mime_type: z.string().optional(),
        captured_at: z.string().optional().nullable(),
        exif: z.record(z.any()).optional(),
      })
    )
    .optional(),
  thumbnails: z
    .array(z.object({ asset_id: z.string().uuid(), content_base64: z.string().min(1), mime: z.string().optional() }))
    .max(20)
    .optional(),
});

export async function POST(request: Request) {
  const admin = createAdminClient() as any;
  const worker = await authenticateWorker(request, admin);
  if (!worker) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const { data: task } = await admin
    .from('worker_tasks')
    .select('id, task_type, job_id, worker_id, status')
    .eq('id', body.task_id)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
  if (task.worker_id && task.worker_id !== worker.id) {
    return NextResponse.json({ error: 'task_not_owned' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const summary: Record<string, unknown> = { ...(body.result ?? {}) };

  if (body.status === 'failed') {
    await admin.from('worker_tasks').update({ status: 'failed', error: body.error ?? null, completed_at: now }).eq('id', task.id);
    await admin.from('tool_runs').insert({
      job_id: task.job_id,
      tool_type: task.task_type,
      provider: 'local_worker',
      status: 'failed',
      error: body.error ?? null,
      completed_at: now,
    });
    await admin.from('production_events').insert({
      job_id: task.job_id,
      actor_type: 'worker',
      actor_id: worker.id,
      event_type: 'worker_task_failed',
      summary: `Worker task failed: ${task.task_type}`,
      details: { task_id: task.id, error: body.error ?? null },
    });
    return NextResponse.json({ ok: true });
  }

  // ---- scan_folder: index discovered files as assets ----
  if (task.task_type === 'scan_folder' && body.files) {
    let storageLocationId: string | null = null;
    if (body.storage_location) {
      const { name, kind, root_path } = body.storage_location;
      let loc = (await admin.from('storage_locations').select('id').eq('name', name).eq('kind', kind).maybeSingle()).data;
      if (!loc) {
        loc = (await admin.from('storage_locations').insert({ name, kind, root_path: root_path ?? null }).select('id').single()).data;
      }
      storageLocationId = loc?.id ?? null;
    }

    // Dedupe by (job_id, local_path) so re-scans don't duplicate.
    const { data: existing } = await admin.from('assets').select('local_path').eq('job_id', task.job_id);
    const seen = new Set((existing ?? []).map((a: any) => a.local_path).filter(Boolean));

    const rows = body.files
      .filter((f) => !seen.has(f.local_path))
      .map((f) => ({
        job_id: task.job_id,
        storage_location_id: storageLocationId,
        asset_type: 'source',
        media_type: mediaTypeFromExt(f.filename),
        status: 'indexed',
        filename: f.filename,
        local_path: f.local_path,
        byte_size: f.byte_size ?? 0,
        mime_type: f.mime_type ?? null,
        captured_at: f.captured_at ?? null,
        exif: f.exif ?? {},
        metadata: { source: 'local_worker' },
      }));
    let inserted: any[] = [];
    if (rows.length) {
      const { data } = await admin.from('assets').insert(rows).select('id, filename, exif, local_path, media_type');
      inserted = data ?? [];
    }

    summary.indexed = inserted.length;
    summary.skipped = body.files.length - inserted.length;

    // scan → rescue integration ------------------------------------------------
    const newPhotos = inserted.filter((a: any) => a.media_type === 'photo');

    // (1) Auto-queue thumbnail generation for the new photos (worker-targeted so
    // the machine that has the files does it). Chunked to the server's 20/task cap.
    const items = newPhotos.filter((a: any) => a.local_path).map((a: any) => ({ asset_id: a.id, local_path: a.local_path }));
    let thumbTasks = 0;
    for (let i = 0; i < items.length; i += 20) {
      await admin.from('worker_tasks').insert({
        job_id: task.job_id,
        worker_id: worker.id,
        task_type: 'generate_thumbnails',
        status: 'queued',
        payload: { items: items.slice(i, i + 20) },
      });
      thumbTasks++;
    }
    summary.thumbnail_tasks = thumbTasks;

    // (2) For real-estate-photo jobs, detect + persist bracket groups so the
    // scanned shoot flows straight into Photo Rescue.
    if (newPhotos.length) {
      const jobRow = (await admin.from('jobs').select('job_types(key)').eq('id', task.job_id).maybeSingle()).data;
      if (jobRow?.job_types?.key === 'real_estate_photo') {
        const det = await persistDetectedGroups(
          admin,
          task.job_id,
          newPhotos.map((a: any) => ({ id: a.id, filename: a.filename, exif: a.exif }))
        );
        summary.bracket_groups = det.groups;
        summary.needs_review = det.needs_review;
      }
    }

    await admin.from('production_events').insert([
      { job_id: task.job_id, actor_type: 'worker', actor_id: worker.id, event_type: 'folder_scanned', summary: `Scanned ${body.files.length} files`, details: { task_id: task.id } },
      { job_id: task.job_id, actor_type: 'worker', actor_id: worker.id, event_type: 'assets_indexed', summary: `Indexed ${inserted.length} new assets`, details: summary },
    ]);
  }

  // ---- generate_thumbnails: store posted previews ----
  if (task.task_type === 'generate_thumbnails' && body.thumbnails) {
    let stored = 0;
    for (const t of body.thumbnails) {
      const ext = (t.mime ?? '').includes('png') ? 'png' : (t.mime ?? '').includes('webp') ? 'webp' : 'jpg';
      const pathInBucket = `${task.job_id ?? 'misc'}/${t.asset_id}.${ext}`;
      const buffer = Buffer.from(t.content_base64, 'base64');
      const { error: upErr } = await admin.storage.from('thumbnails').upload(pathInBucket, buffer, {
        contentType: t.mime ?? 'image/jpeg',
        upsert: true,
      });
      if (upErr) continue;
      await admin.from('assets').update({ thumbnail_url: pathInBucket }).eq('id', t.asset_id);
      stored++;
    }
    summary.thumbnails = stored;
    await admin.from('production_events').insert({
      job_id: task.job_id,
      actor_type: 'worker',
      actor_id: worker.id,
      event_type: 'thumbnails_generated',
      summary: `Stored ${stored} thumbnail(s)`,
      details: { task_id: task.id, count: stored },
    });
  }

  await admin.from('worker_tasks').update({ status: 'completed', result: summary, completed_at: now }).eq('id', task.id);
  await admin.from('tool_runs').insert({
    job_id: task.job_id,
    tool_type: task.task_type,
    provider: 'local_worker',
    status: 'completed',
    output: summary,
    completed_at: now,
  });

  return NextResponse.json({ ok: true, ...summary });
}
