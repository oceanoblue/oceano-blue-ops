import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAccessToken, listCalendars } from '@/lib/google-calendar/api';

const Body = z.object({ team_member_id: z.string().uuid(), viewer_team_member_id: z.string().uuid(), calendar_id: z.string().min(1).max(500) });

async function requireAdmin() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: me, error } = await admin.from('team_members').select('role,is_active').eq('id', user.id).maybeSingle();
  return !error && me?.is_active && me.role === 'admin' ? admin : null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  const [connections, assignments] = await Promise.all([
    admin.from('team_calendar_connections').select('team_member_id,account_email,is_active,scope').eq('provider','google').eq('is_active',true),
    admin.from('team_shared_calendar_assignments').select('team_member_id,viewer_team_member_id,calendar_id'),
  ]);
  if (connections.error || assignments.error) return NextResponse.json({ error: 'Calendar settings unavailable.' }, { status: 503 });
  try {
    const calendars = (await Promise.all((connections.data ?? []).map(async (connection: any) => {
      const token = await getAccessToken(connection.team_member_id);
      if (!token) return [];
      return (await listCalendars(token)).map(calendar => ({ ...calendar, viewer_team_member_id: connection.team_member_id, account_email: connection.account_email }));
    }))).flat();
    return NextResponse.json({ calendars, assignments: assignments.data });
  } catch {
    return NextResponse.json({ error: 'Could not verify Google calendars. Reconnect the account and try again.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.team_member_id === parsed.data.viewer_team_member_id)
    return NextResponse.json({ error: 'Choose a crew member and a shared calendar.' }, { status: 400 });
  const { team_member_id, viewer_team_member_id, calendar_id } = parsed.data;
  const { data: member } = await admin.from('team_members').select('id,is_active').eq('id',team_member_id).maybeSingle();
  if (!member?.is_active) return NextResponse.json({ error: 'Crew member unavailable.' }, { status: 400 });
  try {
    const token = await getAccessToken(viewer_team_member_id);
    if (!token) return NextResponse.json({ error: 'Connected account unavailable.' }, { status: 503 });
    const now = new Date();
    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ timeMin: now.toISOString(), timeMax: new Date(now.getTime() + 86400000).toISOString(), items: [{ id: calendar_id }] }),
    });
    const data = response.ok ? await response.json() : null;
    if (!response.ok || !Array.isArray(data?.calendars?.[calendar_id]?.busy) || data.calendars[calendar_id].errors?.length)
      return NextResponse.json({ error: 'The connected account cannot read that calendar.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Could not verify access to the shared calendar.' }, { status: 503 });
  }
  const { error } = await admin.from('team_shared_calendar_assignments').upsert({ team_member_id, viewer_team_member_id, calendar_id }, { onConflict: 'viewer_team_member_id,calendar_id' });
  return error ? NextResponse.json({ error: 'Could not save calendar assignment.' }, { status: 500 }) : NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid calendar assignment.' }, { status: 400 });
  const { error } = await admin.from('team_shared_calendar_assignments').delete().match(parsed.data);
  return error ? NextResponse.json({ error: 'Could not remove calendar assignment.' }, { status: 500 }) : NextResponse.json({ ok: true });
}
