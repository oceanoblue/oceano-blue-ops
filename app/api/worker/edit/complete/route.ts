import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateWorker } from '@/lib/worker/auth';

export const dynamic = 'force-dynamic';

/**
 * Daemon reports an edit job done or failed. On success we record the rendered
 * output (already uploaded via the signed URL) and move the order to 'ready'
 * for the human review gate — never straight to delivered. On failure we store
 * the error and re-queue if attempts remain, else mark failed.
 */
const Body = z.object({
  edit_job_id: z.string().uuid(),
  status: z.enum(['done', 'failed']),
  result_path: z.string().optional(),
  result_filename: z.string().optional(),
  result_byte_size: z.number().int().nonnegative().optional(),
  result_duration_seconds: z.number().nonnegative().optional(),
  error: z.string().max(4000).optional(),
});

const MAX_ATTEMPTS = 3;

export async function POST(request: Request) {
  const admin = createAdminClient() as any;
  const worker = await authenticateWorker(request, admin);
  if (!worker) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(worker.capabilities ?? []).includes('edit_video')) {
    return NextResponse.json({ error: 'missing_capability' }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const { data: job } = await admin
    .from('edit_jobs')
    .select('id, order_id, worker_id, status, attempts')
    .eq('id', body.edit_job_id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (job.worker_id && job.worker_id !== worker.id) {
    return NextResponse.json({ error: 'not_owned' }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (body.status === 'failed') {
    const requeue = (job.attempts ?? 0) < MAX_ATTEMPTS;
    await admin
      .from('edit_jobs')
      .update({
        status: requeue ? 'queued' : 'failed',
        worker_id: requeue ? null : job.worker_id,
        error: body.error ?? 'unknown_error',
        completed_at: requeue ? null : now,
      })
      .eq('id', job.id);
    return NextResponse.json({ ok: true, requeued: requeue });
  }

  // Success → record render + flip the order to the review gate.
  await admin
    .from('edit_jobs')
    .update({
      status: 'done',
      completed_at: now,
      result_bucket: 'reel-renders',
      result_path: body.result_path ?? null,
      result_filename: body.result_filename ?? null,
      result_byte_size: body.result_byte_size ?? null,
      result_duration_seconds: body.result_duration_seconds ?? null,
      error: null,
    })
    .eq('id', job.id);

  await admin
    .from('orders')
    .update({ status: 'ready', updated_at: now })
    .eq('id', job.order_id);

  return NextResponse.json({ ok: true });
}
