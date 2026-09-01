import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One-shot: push all UPCOMING scheduled shoots onto the office calendars (master
 * + assignee). Scoped to now-onward so we don't clutter with long-past shoots.
 * Staff-gated. Idempotent — re-running just updates the existing events.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: isTeam } = await supabase.rpc('is_team_member');
  if (!isTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient() as any;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // yesterday onward
  const { data: orders, error } = await admin
    .from('orders')
    .select('id')
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', cutoff)
    .is('archived_at', null)
    .not('status', 'in', '(cancelled,draft)')
    .order('scheduled_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let synced = 0;
  for (const o of orders ?? []) {
    try {
      await syncShootCalendar(o.id);
      synced += 1;
    } catch {
      /* fail-soft per order */
    }
  }
  return NextResponse.json({ ok: true, synced, total: (orders ?? []).length });
}
