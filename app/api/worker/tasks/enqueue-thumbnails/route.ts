import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Backfill thumbnails for a job's already-indexed local assets (owner action).
 * Builds generate_thumbnails worker_tasks (server-side, so the owner doesn't
 * need asset IDs) for photos that have a local_path but no thumbnail yet, then
 * an online worker with file access produces and uploads the previews.
 */
const Body = z.object({ job_id: z.string().uuid() });

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: isTeam } = await supabase.rpc('is_team_member');
  if (!isTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { job_id } = parsed.data;
  const admin = createAdminClient() as any;

  const { data: assets } = await admin
    .from('assets')
    .select('id, local_path')
    .eq('job_id', job_id)
    .eq('media_type', 'photo')
    .is('thumbnail_url', null)
    .not('local_path', 'is', null);

  const items = (assets ?? [])
    .filter((a: any) => a.local_path)
    .map((a: any) => ({ asset_id: a.id, local_path: a.local_path }));

  if (items.length === 0) {
    return NextResponse.json({ ok: true, queued_tasks: 0, assets: 0, message: 'No local photos missing thumbnails.' });
  }

  let queued = 0;
  for (let i = 0; i < items.length; i += 20) {
    await admin.from('worker_tasks').insert({
      job_id,
      task_type: 'generate_thumbnails',
      status: 'queued',
      payload: { items: items.slice(i, i + 20) },
    });
    queued++;
  }

  await admin.from('production_events').insert({
    job_id,
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'worker_task_queued',
    summary: `Queued thumbnail generation for ${items.length} photo(s)`,
    details: { tasks: queued, assets: items.length },
  });

  return NextResponse.json({ ok: true, queued_tasks: queued, assets: items.length });
}
