import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateWorker } from '@/lib/worker/auth';

export const dynamic = 'force-dynamic';

/**
 * Worker poll: claim up to `max` queued tasks whose task_type is within the
 * worker's capabilities. Claiming is guarded (status must still be 'queued' on
 * update) so two workers can't grab the same task.
 */
const Body = z.object({ max: z.number().int().min(1).max(10).optional() });

export async function POST(request: Request) {
  const admin = createAdminClient() as any;
  const worker = await authenticateWorker(request, admin);
  if (!worker) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  const max = (parsed.success && parsed.data.max) || 1;
  const caps: string[] = worker.capabilities ?? [];
  if (caps.length === 0) return NextResponse.json({ ok: true, tasks: [] });

  // Candidate queued tasks for this worker's capabilities (oldest first).
  const { data: candidates } = await admin
    .from('worker_tasks')
    .select('id, task_type, payload, job_id')
    .eq('status', 'queued')
    .in('task_type', caps)
    .or(`worker_id.is.null,worker_id.eq.${worker.id}`)
    .order('created_at', { ascending: true })
    .limit(max);

  const claimed: any[] = [];
  for (const c of candidates ?? []) {
    const { data: updated } = await admin
      .from('worker_tasks')
      .update({ status: 'running', worker_id: worker.id, started_at: new Date().toISOString() })
      .eq('id', c.id)
      .eq('status', 'queued') // guard against a race
      .select('id, task_type, payload, job_id')
      .maybeSingle();
    if (updated) claimed.push(updated);
  }

  // Touch heartbeat on poll.
  await admin.from('local_workers').update({ status: 'online', last_heartbeat_at: new Date().toISOString() }).eq('id', worker.id);

  return NextResponse.json({ ok: true, tasks: claimed });
}
