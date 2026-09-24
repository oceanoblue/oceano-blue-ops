import { encryptionConfigured, encryptedToken, openToken, sealToken } from './token-encryption';
import { createHash } from 'node:crypto';
import { calendarNeedsReconnect } from './health';
import { MASTER_CALENDAR_ID } from './calendars';
import { createAdminClient } from '@/lib/supabase/server';
import { refreshAccessToken, GoogleTokenError } from './oauth';
import { captureError, logEvent } from '@/lib/observability/report';

/**
 * Returns a valid access token for the given team_member. Refreshes if
 * expired, persists the new token, returns it. Returns null if the member
 * has no active connection.
 */
export async function getAccessToken(teamMemberId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: row, error: readError } = await supabase
    .from('team_calendar_connections')
    .select('id, access_token, refresh_token, expires_at, is_active')
    .eq('team_member_id', teamMemberId)
    .eq('provider', 'google')
    .maybeSingle();

  if (readError) throw readError;
  if (!row || !(row as any).is_active) return null;
  const r = row as any;
  const accessToken = r.access_token ? openToken(r.access_token, teamMemberId, 'access') : null;
  const refreshToken = r.refresh_token ? openToken(r.refresh_token, teamMemberId, 'refresh') : null;
  if (encryptionConfigured() && ((accessToken && !encryptedToken(r.access_token)) || (refreshToken && !encryptedToken(r.refresh_token)))) {
    const { error } = await supabase.from('team_calendar_connections').update({
      access_token: accessToken ? sealToken(accessToken, teamMemberId, 'access') : null,
      refresh_token: refreshToken ? sealToken(refreshToken, teamMemberId, 'refresh') : null,
    }).eq('id', r.id);
    if (error) throw new Error('Google credentials could not be protected.');
  }
  const expiresAt = r.expires_at ? new Date(r.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000 && accessToken) return accessToken;
  if (!refreshToken) return null;

  try {
    const t = await refreshAccessToken(refreshToken);
    const newExpires = new Date(Date.now() + t.expires_in * 1000).toISOString();
    await supabase
      .from('team_calendar_connections')
      .update({ access_token: encryptionConfigured() ? sealToken(t.access_token, teamMemberId, 'access') : t.access_token, expires_at: newExpires })
      .eq('id', r.id);
    return t.access_token;
  } catch (e) {
    // A temporary provider/network outage must not disconnect the account.
    if (!(e instanceof GoogleTokenError) || e.code !== 'invalid_grant') throw e;
    // Revoked refresh tokens require consent again.
    await supabase
      .from('team_calendar_connections')
      .update({ is_active: false })
      .eq('id', r.id);
    return null;
  }
}

export interface FreeBusyRange { start: string; end: string }

/**
 * Where a person's busy time came from: their own OAuth connection, a calendar
 * they shared with a connected Ops account, or nowhere (internal hours only).
 */
export type BusySource = 'own' | 'shared' | 'none';

interface CalendarListEntry { id: string; accessRole: string }

const READABLE_ROLES = new Set(['reader', 'writer', 'owner']);

// Google's virtual calendars (holidays, birthdays, contacts). They are all-day
// and never a personal conflict, and FreeBusy often cannot read them anyway.
const isVirtualCalendar = (id: string) => id.endsWith('@group.v.calendar.google.com');

async function listCalendars(token: string): Promise<CalendarListEntry[]> {
  try {
    const r = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&fields=items(id,accessRole),nextPageToken',
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }
    );
    if (!r.ok) throw new Error(`calendar_list_${r.status}`);
    const ld: any = await r.json();
    if (ld.nextPageToken) throw new Error('calendar_list_limit');
    return (ld.items ?? [])
      .filter((c: any) => c.id && c.accessRole && c.accessRole !== 'none')
      .map((c: any) => ({ id: String(c.id), accessRole: String(c.accessRole) }));
  } catch {
    throw new Error('calendar_list_unavailable');
  }
}

/**
 * Calendars that appear in someone's Google list but describe OTHER people:
 * a teammate's shared calendar, or the master bookings calendar (which holds
 * every crew member's shoots). Counting them made one person's row show the
 * whole team's commitments.
 */
async function otherPeoplesCalendars(teamMemberId: string): Promise<Set<string>> {
  const admin = createAdminClient() as any;
  const [members, contractors] = await Promise.all([
    admin.from('team_members').select('id,email'),
    admin.from('contractors').select('team_member_id,email'),
  ]);
  if (members.error || contractors.error) throw members.error || contractors.error;
  const ids = new Set<string>([MASTER_CALENDAR_ID.toLowerCase()]);
  for (const m of members.data ?? []) if (m.id !== teamMemberId && m.email) ids.add(String(m.email).toLowerCase());
  for (const c of contractors.data ?? []) if (c.team_member_id !== teamMemberId && c.email) ids.add(String(c.email).toLowerCase());
  return ids;
}

/**
 * Busy time from a calendar we can read event details on. Unlike FreeBusy this
 * lets us drop all-day events: Google places them at midnight in the CALENDAR's
 * timezone (HoneyBook calendars are UTC, so an all-day project became an
 * 8 PM–8 PM Eastern block), and all-day entries are project markers or
 * reminders, not timed conflicts. Real time off belongs in Ops time-off.
 */
async function readableBusy(token: string, calendarId: string, startIso: string, endIso: string): Promise<FreeBusyRange[]> {
  const busy: FreeBusyRange[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const url = new URL(calUrl(calendarId));
    url.searchParams.set('timeMin', startIso);
    url.searchParams.set('timeMax', endIso);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('fields', 'items(status,transparency,eventType,start,end,attendees(self,responseStatus)),nextPageToken');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) {
      await reportApiFailure('listEvents', r, { calendarType: calendarId.endsWith('.google.com') ? 'group' : 'standard' });
      throw new Error(`calendar_events_${r.status}`);
    }
    const data: any = await r.json();
    for (const e of data.items ?? []) {
      if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
      if (!e.start?.dateTime || !e.end?.dateTime) continue; // all-day
      if (e.eventType === 'workingLocation' || e.eventType === 'birthday') continue;
      if ((e.attendees ?? []).some((a: any) => a.self && a.responseStatus === 'declined')) continue;
      const start = Date.parse(e.start.dateTime), end = Date.parse(e.end.dateTime);
      if (Number.isFinite(start) && end > start) busy.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) return busy;
  }
  throw new Error('calendar_events_limit');
}

/** Busy time from calendars shared as "See only free/busy". */
async function freeBusyRanges(token: string, calendarIds: string[], startIso: string, endIso: string, teamMemberId: string): Promise<FreeBusyRange[]> {
  if (!calendarIds.length) return [];
  const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ timeMin: startIso, timeMax: endIso, items: calendarIds.map((id) => ({ id })) }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    captureError('gcal.freeBusy', new Error(`freebusy_${r.status}: ${body.slice(0, 300)}`), { teamMemberId });
    throw new Error(`calendar_freebusy_${r.status}`);
  }
  const cals = ((await r.json()) as any)?.calendars ?? {};
  const busy: FreeBusyRange[] = [];
  for (const key of calendarIds) {
    if (!cals[key] || cals[key].errors?.length || !Array.isArray(cals[key].busy)) {
      logEvent('gcal.freeBusy', 'incomplete', {
        reasons: (cals[key]?.errors ?? []).map((error: { reason?: string }) => error.reason),
      });
      throw new Error('calendar_freebusy_incomplete');
    }
    busy.push(...cals[key].busy);
  }
  return busy;
}

async function busyFromCalendars(token: string, calendars: CalendarListEntry[], startIso: string, endIso: string, teamMemberId: string) {
  if (calendars.length > 50) throw new Error('calendar_list_limit');
  const readable = calendars.filter((c) => READABLE_ROLES.has(c.accessRole));
  const freeBusyOnly = calendars.filter((c) => !READABLE_ROLES.has(c.accessRole)).map((c) => c.id);
  const results = await Promise.all([
    ...readable.map((c) => readableBusy(token, c.id, startIso, endIso)),
    freeBusyRanges(token, freeBusyOnly, startIso, endIso, teamMemberId),
  ]);
  return results.flat();
}

/**
 * A photographer without their own Ops connection can still be verified when
 * they shared their Google Calendar with a connected Ops account (e.g. Karen
 * sharing with gustavo@). Read-only access to that share is enough; they do
 * not need to authorize Ops themselves.
 */
async function sharedCalendarBusy(teamMemberId: string, startIso: string, endIso: string): Promise<FreeBusyRange[] | null> {
  const admin = createAdminClient() as any;
  const [member, contractors, viewers] = await Promise.all([
    admin.from('team_members').select('email').eq('id', teamMemberId).maybeSingle(),
    admin.from('contractors').select('email').eq('team_member_id', teamMemberId),
    admin.from('team_calendar_connections').select('team_member_id,is_active,scope').eq('provider', 'google').eq('is_active', true),
  ]);
  if (member.error || contractors.error || viewers.error) throw member.error || contractors.error || viewers.error;
  const emails = new Set<string>(
    [member.data?.email, ...(contractors.data ?? []).map((c: any) => c.email)]
      .filter(Boolean).map((e: string) => e.toLowerCase())
  );
  if (!emails.size) return null;
  let failed = false;
  for (const viewer of (viewers.data ?? []).filter((v: any) => v.team_member_id !== teamMemberId && !calendarNeedsReconnect(v))) {
    try {
      const token = await getAccessToken(viewer.team_member_id);
      if (!token) { failed = true; continue; }
      const shared = (await listCalendars(token)).filter((c) => emails.has(c.id.toLowerCase()));
      if (!shared.length) continue;
      const busy = await busyFromCalendars(token, shared, startIso, endIso, teamMemberId);
      logEvent('gcal.freeBusy', 'ok', { teamMemberId, source: 'shared', calendars: shared.length, busyCount: busy.length });
      return busy;
    } catch {
      failed = true;
    }
  }
  // A share we could not check must not look like an empty calendar.
  if (failed) throw new Error('calendar_shared_unavailable');
  return null;
}

/** Returns a person's busy ranges in [start, end] and where they came from. */
export async function fetchMemberBusy(
  teamMemberId: string,
  startIso: string,
  endIso: string
): Promise<{ source: BusySource; busy: FreeBusyRange[] }> {
  const admin = createAdminClient();
  const { data: connection, error } = await admin.from('team_calendar_connections')
    .select('is_active, scope').eq('team_member_id', teamMemberId).eq('provider', 'google').maybeSingle();
  if (error) throw error;
  if (!connection) {
    // Never-connected photographers fall back to a shared calendar, then to
    // internal hours/blocks.
    const shared = await sharedCalendarBusy(teamMemberId, startIso, endIso);
    return shared ? { source: 'shared', busy: shared } : { source: 'none', busy: [] };
  }
  // Once a calendar is connected, a broken connection must never look empty.
  if (calendarNeedsReconnect(connection)) throw new Error('calendar_reconnect_required');
  const token = await getAccessToken(teamMemberId);
  if (!token) throw new Error('calendar_reconnect_required');

  // The person's own calendars (primary, HoneyBook, ...). Teammates' shared
  // calendars, the master bookings calendar and Google's holiday subscriptions
  // are not this person's conflicts. Neither is any calendar they can only see
  // as free/busy: someone else owns it and shared just their availability
  // (e.g. a crew member's second calendar shared with the office).
  const [calendars, others] = await Promise.all([listCalendars(token), otherPeoplesCalendars(teamMemberId)]);
  const own = calendars.filter((c) => READABLE_ROLES.has(c.accessRole) && !isVirtualCalendar(c.id) && !others.has(c.id.toLowerCase()));
  const busy = await busyFromCalendars(token, own, startIso, endIso, teamMemberId);
  logEvent('gcal.freeBusy', 'ok', { teamMemberId, source: 'own', calendars: own.length, busyCount: busy.length });
  return { source: 'own', busy };
}

/** Returns busy ranges for a person in [start, end]. */
export async function fetchBusyRanges(teamMemberId: string, startIso: string, endIso: string): Promise<FreeBusyRange[]> {
  return (await fetchMemberBusy(teamMemberId, startIso, endIso)).busy;
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

/** Read one event back. Only a confirmed 404/410 means it is gone. */
export async function getEvent(
  actorTeamMemberId: string,
  calendarId: string,
  eventId: string
): Promise<ExistingEvent | null> {
  const token = await getAccessToken(actorTeamMemberId);
  if (!token) throw new Error('calendar_reconnect_required');
  const r = await fetch(calUrl(calendarId, `/${encodeURIComponent(eventId)}`), {
    signal: AbortSignal.timeout(10000),
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    if (r.status === 404 || r.status === 410) return null;
    await reportApiFailure('getEvent', r, { calendarId, eventId });
    throw new Error(`calendar_read_${r.status}`);
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
  sendUpdates: SendUpdates = 'none',
  idempotencyKey?: string
): Promise<CalendarEvent | null> {
  const token = await getAccessToken(actorTeamMemberId);
  if (!token) {
    logEvent('gcal.insertEvent', 'no_token', { actorTeamMemberId, calendarId });
    return null;
  }
  // Google retains deleted event IDs. Walk deterministic replacement IDs so a
  // person removed and later reassigned gets a new hold, while retries converge.
  for (let generation = 0; generation < 8; generation++) {
    const key = generation === 0 ? idempotencyKey : `${idempotencyKey}:replacement:${generation}`;
    const id = idempotencyKey ? createHash('sha256').update(key!).digest('hex') : undefined;
    const r = await fetch(calUrl(calendarId, `?sendUpdates=${sendUpdates}`), {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...toBody(payload), ...(id ? { id } : {}) }),
    });
    if (r.status === 409 && id) {
      // A transient read error throws; only confirmed deletion allows rotation.
      const existing = await getEvent(actorTeamMemberId, calendarId, id);
      if (!existing || existing.status === 'cancelled') continue;
      return updateEvent(actorTeamMemberId, calendarId, id, payload, sendUpdates);
    }
    if (!r.ok) {
      await reportApiFailure('insertEvent', r, { actorTeamMemberId, calendarId });
      return null;
    }
    const data: any = await r.json();
    return { id: data.id, htmlLink: data.htmlLink };
  }
  throw new Error('calendar_event_id_conflict');
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
      signal: AbortSignal.timeout(10000),
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
      signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${token}` },
    }
  );
  // 404/410 = already gone, which is the outcome we wanted.
  if (!r.ok && r.status !== 404 && r.status !== 410) {
    await reportApiFailure('deleteEvent', r, { actorTeamMemberId, calendarId, eventId });
  }
}
