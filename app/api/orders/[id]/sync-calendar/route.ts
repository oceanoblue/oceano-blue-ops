import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';

/**
 * Re-sync one order's Google Calendar events (master + assignee). Called by the
 * office controls after assigning, rescheduling, or changing a shoot's status.
 * Staff-gated. Fail-soft.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: isTeam } = await supabase.rpc('is_team_member');
  if (!isTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    await syncShootCalendar(params.id);
  } catch (e) {
    console.error('[sync-calendar]', e);
  }
  return NextResponse.json({ ok: true });
}
