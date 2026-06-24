import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateWorker } from '@/lib/worker/auth';

export const dynamic = 'force-dynamic';

/**
 * Full context for a claimed edit job: the brief, the edit plan, and freshly
 * signed download URLs for every footage clip (6 h TTL — long enough to pull a
 * multi-GB set). Worker-auth only; the daemon must own the running job.
 */
export async function GET(request: Request) {
  const admin = createAdminClient() as any;
  const worker = await authenticateWorker(request, admin);
  if (!worker) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(worker.capabilities ?? []).includes('edit_video')) {
    return NextResponse.json({ error: 'missing_capability' }, { status: 403 });
  }

  const editJobId = new URL(request.url).searchParams.get('edit_job_id');
  if (!editJobId) return NextResponse.json({ error: 'edit_job_id required' }, { status: 400 });

  const { data: job } = await admin
    .from('edit_jobs')
    .select('id, order_id, status, worker_id, edit_plan')
    .eq('id', editJobId)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (job.worker_id && job.worker_id !== worker.id) {
    return NextResponse.json({ error: 'not_owned' }, { status: 403 });
  }

  const { data: order } = await admin
    .from('orders')
    .select('id, order_kind, reel_briefs(*)')
    .eq('id', job.order_id)
    .maybeSingle();
  const brief = order
    ? Array.isArray(order.reel_briefs)
      ? order.reel_briefs[0]
      : order.reel_briefs
    : null;

  const { data: footage } = await admin
    .from('order_footage')
    .select('id, bucket, storage_path, filename, role, notes, duration_seconds, mime_type')
    .eq('order_id', job.order_id)
    .order('created_at', { ascending: true });

  const clips = await Promise.all(
    (footage ?? []).map(async (f: any) => {
      const { data: signed } = await admin.storage
        .from(f.bucket)
        .createSignedUrl(f.storage_path, 6 * 3600);
      return {
        id: f.id,
        filename: f.filename,
        role: f.role,
        notes: f.notes,
        duration_seconds: f.duration_seconds,
        mime_type: f.mime_type,
        url: signed?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({
    ok: true,
    edit_job_id: job.id,
    order_id: job.order_id,
    order_kind: order?.order_kind ?? null,
    brief,
    edit_plan: job.edit_plan,
    footage: clips,
  });
}
