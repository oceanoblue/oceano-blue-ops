import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Live AI-processing progress for an order — drives the order-page progress bar. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data: jobs } = await admin.from('ai_jobs').select('status').eq('order_id', params.id);

  const c = { total: 0, pending: 0, running: 0, complete: 0, failed: 0 };
  for (const j of jobs ?? []) {
    c.total++;
    const s = j.status === 'queued' ? 'pending' : j.status;
    if (s === 'pending' || s === 'running' || s === 'complete' || s === 'failed') (c as any)[s]++;
  }

  const { count: processed } = await admin
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', params.id)
    .eq('kind', 'processed');

  const active = c.pending + c.running;
  return NextResponse.json({ ...c, processed_photos: processed ?? 0, active, done: active === 0 && c.total > 0 });
}
