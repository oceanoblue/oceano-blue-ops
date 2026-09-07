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

export interface EventPayload {
  summary: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  timezone: string;
  /**
   * Guests to invite. Google delivers the event to each guest's own calendar
   * (any Gmail / Workspace address) with an emailed invitation — no calendar
   * sharing required. This is how a shoot reaches a photographer whose calendar
   * we can't write to directly. `responseStatus` lets the organizer SET the
   * guest's RSVP (we mirror the app's accept / decline onto the invite).
   */
  attendees?: Attendee[];
  /** 'transparent' = shows as FREE (visible but doesn't block); 'opaque' = busy. */
  transparency?: 'opaque' | 'transparent';
}

export type AttendeeStatus = 'needsAction' | 'accepted' | 'declined' | 'tentative';
export interface Attendee {
  email: string;
  responseStatus?: AttendeeStatus;
}

/** Whether Google should email guests about this write. Defaults to 'none'. */
export type SendUpdates = 'all' | 'none';

function toBody(payload: EventPayload): any {
  const body: any = {
    summary: payload.summary,
    description: payload.description,
    location: payload.location,
    start: { dateTime: payload.startIso, timeZone: payload.timezone },
    end: { dateTime: payload.endIso, timeZone: payload.timezone },
    reminders: { useDefault: true },
  };
  if (payload.transparency) body.transparency = payload.transparency;
  // Always send the attendee list (even empty) so a PATCH can REMOVE a guest
  // after a reassignment — omitting the key would leave the old guest invited.
  body.attendees = (payload.attendees ?? []).map((a) => ({
    email: a.email,
    ...(a.responseStatus ? { responseStatus: a.responseStatus } : {}),
  }));
  return body;
}

const calUrl = (calendarId: string, suffix = '') =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${suffix}`;

/** Log a non-2xx Calendar API response so a silent sync failure is greppable. */
async function reportApiFailure(op: string, r: Response, ctx: Record<string, unknown>) {
  const body = await r.text().catch(() => '');
  captureError(`gcal.${op}`, new Error(`${op}_${r.status}: ${body.slice(0, 300)}`), ctx);
}

/** A trimmed view of an existing Google event, for change detection. */
export interface ExistingEvent {
  id: string;
  status: string;
  summary: string;
  description: string;
  location: string;
  startIso: string;
  endIso: string;
  transparency: 'opaque' | 'transparent';
  /** Guests, lower-cased and sorted by email, with their current RSVP. */
  attendees: { email: string; responseStatus: AttendeeStatus }[];
}

/** Read one event back. Returns null when it's gone (404) or the call fails. */
export async function getEvent(
  actorTeamMemberId: string,
  calendarId: string,
  eventId: string
): Promise<ExistingEvent | null> {
  const token = await getAccessToken(actorTeamMemberId);
  if (!token) return null;
  const r = await fetch(calUrl(calendarId, `/${encodeURIComponent(eventId)}`), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    if (r.status !== 404) await reportApiFailure('getEvent', r, { calendarId, eventId });
    return null;
  }
  const e: any = await r.json();
  return {
    id: e.id,
    status: e.status ?? 'confirmed',
    summary: e.summary ?? '',
    description: e.description ?? '',
    location: e.location ?? '',
    startIso: e.start?.dateTime ?? '',
    endIso: e.end?.dateTime ?? '',
    transparency: e.transparency === 'transparent' ? 'transparent' : 'opaque',
    attendees: ((e.attendees ?? []) as any[])
      .map((a) => ({
        email: String(a.email ?? '').toLowerCase(),
        responseStatus: (a.responseStatus as AttendeeStatus) || 'needsAction',
      }))
      .filter((a) => a.email)
      .sort((a, b) => a.email.localeCompare(b.email)),
  };
}

/**
 * Insert an event onto `calendarId`, authenticating as `actorTeamMemberId`.
 * `calendarId` can be 'primary' or any calendar shared with the actor's account
 * (e.g. the master info@ calendar, or a photographer's shared calendar).
 */
export async function insertEvent(
  actorTeamMemberId: string,
  calendarId: string,
  payload: EventPayload,
  sendUpdates: SendUpdates = 'none'
): Promise<CalendarEvent | null> {
  const token = await getAccessToken(actorTeamMemberId);
  if (!token) {
    logEvent('gcal.insertEvent', 'no_token', { actorTeamMemberId, calendarId });
    return null;
  }
  const r = await fetch(calUrl(calendarId, `?sendUpdates=${sendUpdates}`), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(toBody(payload)),
  });
  if (!r.ok) {
    await reportApiFailure('insertEvent', r, { actorTeamMemberId, calendarId });
    return null;
  }
  const data: any = await r.json();
  return { id: data.id, htmlLink: data.htmlLink };
}

/** Patch an existing event on `calendarId` (retitle / move / free-busy change). */
export async function updateEvent(
  actorTeamMemberId: string,
  calendarId: string,
  eventId: string,
  payload: EventPayload,
  sendUpdates: SendUpdates = 'none'
): Promise<CalendarEvent | null> {
  const token = await getAccessToken(actorTeamMemberId);
  if (!token) {
    logEvent('gcal.updateEvent', 'no_token', { actorTeamMemberId, calendarId });
    return null;
  }
  const r = await fetch(
    calUrl(calendarId, `/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`),
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(toBody(payload)),
    }
  );
  if (!r.ok) {
    await reportApiFailure('updateEvent', r, { actorTeamMemberId, calendarId, eventId });
    return null;
  }
  const data: any = await r.json();
  return { id: data.id, htmlLink: data.htmlLink };
}

export async function deleteEvent(
  actorTeamMemberId: string,
  calendarId: string,
  eventId: string,
  sendUpdates: SendUpdates = 'none'
): Promise<void> {
  const token = await getAccessToken(actorTeamMemberId);
  if (!token) return;
  const r = await fetch(
    calUrl(calendarId, `/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`),
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    }
  );
  // 404/410 = already gone, which is the outcome we wanted.
  if (!r.ok && r.status !== 404 && r.status !== 410) {
    await reportApiFailure('deleteEvent', r, { actorTeamMemberId, calendarId, eventId });
  }
}
