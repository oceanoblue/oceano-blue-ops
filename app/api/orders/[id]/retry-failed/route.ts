import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Retry an order's failed AI jobs in place — flip them back to pending (fresh
 * attempts), then kick the drain. Reuses the existing photo rows, so no need to
 * re-list Dropbox or re-create anything.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: isTeam } = await supabase.rpc('is_team_member');
  if (!isTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient() as any;
  const { data: retried, error } = await admin
    .from('ai_jobs')
    .update({ status: 'pending', error_message: null, attempts: 0, completed_at: null, started_at: null })
    .eq('order_id', params.id)
    .eq('status', 'failed')
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const n = retried?.length ?? 0;
  if (n > 0) {
    const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    const secret = process.env.CRON_SECRET;
    if (base && secret) {
      const url = base.startsWith('http') ? base : `https://${base}`;
      fetch(`${url}/api/cron/run-pending-jobs`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true, retried: n });
}
