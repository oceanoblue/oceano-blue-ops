import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateWorker } from '@/lib/worker/auth';

export const dynamic = 'force-dynamic';

/**
 * Office-Mac Resolve daemon polls for edit jobs. Claims up to `max` queued
 * edit_jobs (guarded update so two workers can't grab the same one). Requires
 * the 'edit_video' capability. Returns {id, order_id, edit_plan} per job; the
 * daemon then calls /api/worker/edit/context for footage URLs.
 */
const Body = z.object({ max: z.number().int().min(1).max(5).optional() });

export async function POST(request: Request) {
  const admin = createAdminClient() as any;
  const worker = await authenticateWorker(request, admin);
  if (!worker) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(worker.capabilities ?? []).includes('edit_video')) {
    return NextResponse.json({ error: 'missing_capability' }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  const max = (parsed.success && parsed.data.max) || 1;

  const { data: candidates } = await admin
    .from('edit_jobs')
    .select('id, order_id, edit_plan, attempts')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(max);

  const now = new Date().toISOString();
  const claimed: any[] = [];
  for (const c of candidates ?? []) {
    const { data: updated } = await admin
      .from('edit_jobs')
      .update({
        status: 'running',
        worker_id: worker.id,
        started_at: now,
        attempts: (c.attempts ?? 0) + 1,
        error: null,
      })
      .eq('id', c.id)
      .eq('status', 'queued') // race guard
      .select('id, order_id, edit_plan')
      .maybeSingle();
    if (updated) claimed.push(updated);
  }

  await admin
    .from('local_workers')
    .update({ status: 'online', last_heartbeat_at: now })
    .eq('id', worker.id);

  return NextResponse.json({ ok: true, jobs: claimed });
}
