import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { WORKER_CAPS } from '@/lib/worker/auth';

export const dynamic = 'force-dynamic';

/**
 * Enqueue a worker task (owner/internal action). v1 supports scan_folder and
 * generate_thumbnails. The worker validates the requested root against its own
 * allowlist before doing anything on disk.
 */
const Body = z.object({
  job_id: z.string().uuid(),
  task_type: z.enum(WORKER_CAPS),
  worker_id: z.string().uuid().optional(),
  payload: z.record(z.any()).optional(),
});

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
  const admin = createAdminClient() as any;

  const { data: task, error } = await admin
    .from('worker_tasks')
    .insert({
      job_id: parsed.data.job_id,
      worker_id: parsed.data.worker_id ?? null,
      task_type: parsed.data.task_type,
      status: 'queued',
      payload: parsed.data.payload ?? {},
    })
    .select('id')
    .single();
  if (error || !task) return NextResponse.json({ error: error?.message ?? 'enqueue_failed' }, { status: 500 });

  await admin.from('production_events').insert({
    job_id: parsed.data.job_id,
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'worker_task_queued',
    summary: `Queued ${parsed.data.task_type}`,
    details: { task_id: task.id },
  });

  return NextResponse.json({ ok: true, task_id: task.id });
}
