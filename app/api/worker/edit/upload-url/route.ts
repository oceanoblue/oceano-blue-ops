import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateWorker } from '@/lib/worker/auth';

export const dynamic = 'force-dynamic';

/**
 * Issue a one-time signed upload URL so the daemon can PUT the rendered MP4
 * straight into the private reel-renders bucket (bypasses RLS, server-authorized).
 * Path is fixed server-side to <order_id>/<edit_job_id>/<safe filename> — the
 * worker can't choose an arbitrary location.
 */
const Body = z.object({
  edit_job_id: z.string().uuid(),
  filename: z.string().min(1).max(200),
});

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

  const { data: job } = await admin
    .from('edit_jobs')
    .select('id, order_id, worker_id, status')
    .eq('id', parsed.data.edit_job_id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (job.worker_id && job.worker_id !== worker.id) {
    return NextResponse.json({ error: 'not_owned' }, { status: 403 });
  }

  const safe = parsed.data.filename.replace(/[^\w.\-]+/g, '_').slice(-120);
  const path = `${job.order_id}/${job.id}/${safe}`;

  const { data: signed, error } = await admin.storage
    .from('reel-renders')
    .createSignedUploadUrl(path);
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? 'sign_failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    bucket: 'reel-renders',
    path,
    token: signed.token,
    signed_url: signed.signedUrl,
  });
}
