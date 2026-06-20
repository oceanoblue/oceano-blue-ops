import { createAdminClient } from '@/lib/supabase/server';
import { refreshAccessToken } from './oauth';
import { captureError, logEvent } from '@/lib/observability/report';

/**
 * Returns a valid access token for the given team_member. Refreshes if
 * expired, persists the new token, returns it. Returns null if the member
 * has no active connection.
 */
export async function getAccessToken(teamMemberId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from('team_calendar_connections')
    .select('id, access_token, refresh_token, expires_at, is_active')
    .eq('team_member_id', teamMemberId)
    .eq('provider', 'google')
    .maybeSingle();

  if (!row || !(row as any).is_active) return null;
  const r = row as any;
  const expiresAt = r.expires_at ? new Date(r.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000 && r.access_token) return r.access_token;
  if (!r.refresh_token) return null;

  try {
    const t = await refreshAccessToken(r.refresh_token);
    const newExpires = new Date(Date.now() + t.expires_in * 1000).toISOString();
    await supabase
      .from('team_calendar_connections')
      .update({ access_token: t.access_token, expires_at: newExpires })
      .eq('id', r.id);
    return t.access_token;
  } catch (e) {
    // Token revoked or invalid — mark connection inactive
    await supabase
      .from('team_calendar_connections')
      .update({ is_active: false })
      .eq('id', r.id);
    return null;
  }
}

export interface FreeBusyRange { start: string; end: string }

/** Returns busy ranges from the user's primary calendar in [start, end]. */
export async function fetchBusyRanges(
  teamMemberId: string,
  startIso: string,
  endIso: string
): Promise<FreeBusyRange[]> {
  const token = await getAccessToken(teamMemberId);
  if (!token) {
    logEvent('gcal.freeBusy', 'no_token', { teamMemberId });
    return [];
  }

  // Enumerate the user's calendars so events on ANY calendar (not just
  // 'primary') block availability. Falls back to 'primary' if the list call
  // fails (e.g. scope not yet re-granted).
  let calendarIds: string[] = ['primary'];
  try {
    const lr = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&fields=items(id,accessRole)',
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (lr.ok) {
      const ld: any = await lr.json();
      const ids = (ld.items ?? [])
        .filter((c: any) => c.accessRole && c.accessRole !== 'none')
        .map((c: any) => c.id)
        .filter(Boolean);
      if (ids.length) calendarIds = ids.slice(0, 50); // freeBusy caps at 50 items
    }
  } catch {
    /* keep primary fallback */
  }

  const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: startIso,
      timeMax: endIso,
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    captureError('gcal.freeBusy', new Error(`freebusy_${r.status}: ${body.slice(0, 300)}`), {
      teamMemberId,
    });
    return [];
  }
  const data: any = await r.json();
  const cals = data?.calendars ?? {};
  const busy: FreeBusyRange[] = [];
  for (const key of Object.keys(cals)) {
    for (const b of cals[key]?.busy ?? []) busy.push(b);
  }
  logEvent('gcal.freeBusy', 'ok', {
    teamMemberId,
    calendars: calendarIds.length,
    busyCount: busy.length,
  });
  return busy;
}

export interface CalendarEvent {
  id: string;
  htmlLink: string;
}

/** Insert a new event onto the user's primary calendar. */
export async function insertEvent(
  teamMemberId: string,
  payload: {
    summary: string;
    description?: string;
    location?: string;
    startIso: string;
    endIso: string;
    timezone: string;
    attendeeEmails?: string[];
  }
): Promise<CalendarEvent | null> {
  const token = await getAccessToken(teamMemberId);
  if (!token) return null;

  const body: any = {
    summary: payload.summary,
    description: payload.description,
    location: payload.location,
    start: { dateTime: payload.startIso, timeZone: payload.timezone },
    end: { dateTime: payload.endIso, timeZone: payload.timezone },
    reminders: { useDefault: true },
  };
  if (payload.attendeeEmails?.length) {
    body.attendees = payload.attendeeEmails.map((email) => ({ email }));
  }

  const r = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!r.ok) return null;
  const data: any = await r.json();
  return { id: data.id, htmlLink: data.htmlLink };
}

export async function deleteEvent(teamMemberId: string, eventId: string): Promise<void> {
  const token = await getAccessToken(teamMemberId);
  if (!token) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}
