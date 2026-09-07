import { createAdminClient } from '@/lib/supabase/server';
import {
  insertEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  type EventPayload,
  type ExistingEvent,
} from './api';
import { logEvent } from '@/lib/observability/report';
import { signRespondToken, respondPageUrl, respondTokenExpiry } from '@/lib/field/respond-token';

// The master "office" calendar that shows EVERY shoot. Shared with the connected
// admin account so one token can write it. Override with env if it ever changes.
const MASTER_CALENDAR_ID = process.env.MASTER_CALENDAR_ID || 'info@oceanoblue.net';

// Statuses / states that mean "this shoot should NOT be on any calendar".
const DEAD_STATUSES = new Set(['cancelled', 'draft']);

/** The connected admin whose token writes the (shared) master calendar. */
async function getActorId(admin: any): Promise<string | null> {
  const { data: admins } = await admin
    .from('team_members')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true);
  const adminIds = (admins ?? []).map((a: any) => a.id);
  if (adminIds.length === 0) return null;
  const { data: conn } = await admin
    .from('team_calendar_connections')
    .select('team_member_id')
    .eq('provider', 'google')
    .eq('is_active', true)
    .in('team_member_id', adminIds)
    .limit(1)
    .maybeSingle();
  return (conn?.team_member_id as string | undefined) ?? null;
}

/**
 * Which token can touch `calendarId`? The master is written by the admin. A
 * photographer's own calendar is written by THEIR connection when they have one
 * (that's the only token guaranteed to have write access to it); otherwise fall
 * back to the admin, which works only if the calendar was shared with them.
 */
async function actorForCalendar(admin: any, calendarId: string, adminActorId: string) {
  if (calendarId === MASTER_CALENDAR_ID) return adminActorId;
  const { data: conn } = await admin
    .from('team_calendar_connections')
    .select('team_member_id')
    .eq('provider', 'google')
    .eq('is_active', true)
    .ilike('account_email', calendarId)
    .limit(1)
    .maybeSingle();
  return (conn?.team_member_id as string | undefined) ?? adminActorId;
}

/** Delete every calendar event tracked for an order (call BEFORE deleting the order). */
export async function removeShootCalendar(orderId: string): Promise<void> {
  const admin = createAdminClient() as any;
  const actorId = await getActorId(admin);
  const { data: rows } = await admin
    .from('order_calendar_events')
    .select('id, calendar_id, event_id, role')
    .eq('order_id', orderId);
  for (const r of rows ?? []) {
    if (actorId) {
      const actor = await actorForCalendar(admin, r.calendar_id, actorId);
      // Guests on the master get a cancellation email; direct holds are silent.
      await deleteEvent(actor, r.calendar_id, r.event_id, r.role === 'master' ? 'all' : 'none').catch(
        () => {}
      );
    }
  }
  await admin.from('order_calendar_events').delete().eq('order_id', orderId);
}

type Desired = {
  calendarId: string;
  role: 'master' | 'assignee';
  actorId: string;
  payload: EventPayload;
  /** Email guests about this event (invites / updates / cancellations). */
  notify: boolean;
};

/** True when the Google event already matches what we'd write (skip the PATCH). */
export function sameEvent(ex: ExistingEvent, p: EventPayload): boolean {
  const ms = (iso: string) => {
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? iso : t;
  };
  const want = (p.attendees ?? [])
    .map((a) => ({ email: a.email.toLowerCase(), responseStatus: a.responseStatus }))
    .sort((a, b) => a.email.localeCompare(b.email));
  return (
    ex.status !== 'cancelled' &&
    ex.summary === p.summary &&
    ex.description === (p.description ?? '') &&
    ex.location === (p.location ?? '') &&
    ms(ex.startIso) === ms(p.startIso) &&
    ms(ex.endIso) === ms(p.endIso) &&
    ex.transparency === (p.transparency ?? 'opaque') &&
    ex.attendees.length === want.length &&
    ex.attendees.every(
      (a, i) =>
        a.email === want[i].email &&
        // An unset status in the payload means "leave whatever Google has".
        (want[i].responseStatus === undefined || a.responseStatus === want[i].responseStatus)
    )
  );
}

/** Fill in RSVPs we don't want to touch with what Google currently has. */
function carryForwardRsvps(payload: EventPayload, current: ExistingEvent): EventPayload {
  if (!payload.attendees?.length) return payload;
  return {
    ...payload,
    attendees: payload.attendees.map((a) => {
      if (a.responseStatus) return a;
      const cur = current.attendees.find((c) => c.email === a.email.toLowerCase());
      return cur ? { ...a, responseStatus: cur.responseStatus } : a;
    }),
  };
}

/**
 * Reconcile an order's Google Calendar events:
 *
 *   - MASTER (info@): every scheduled shoot — the team's full schedule. FREE
 *     (transparent) so it's a visible reference layer that never marks anyone
 *     busy.
 *   - THE SHOOTER'S OWN CALENDAR. Two ways to get it there, picked per person:
 *       a) They connected Google Calendar in Settings → Integrations: we write a
 *          BUSY hold straight onto their primary calendar with THEIR token.
 *       b) Otherwise (a contractor on a personal Gmail, a team member who never
 *          connected): we invite their email as a GUEST on the master event.
 *          Google delivers it to their calendar with an emailed invitation, and
 *          sends updates / cancellations as the shoot moves or is reassigned.
 *          No calendar sharing needed — that requirement is exactly what used
 *          to make the old "write into their calendar" approach silently fail.
 *
 * Fail-soft: any Google hiccup is logged (see api.ts) but never breaks the caller.
 */
export async function syncShootCalendar(orderId: string): Promise<void> {
  const admin = createAdminClient() as any;

  // Pick the actor: an active admin with a Google connection.
  const actorId = await getActorId(admin);
  if (!actorId) {
    logEvent('gcal.sync', 'no_connected_admin', { orderId });
    return; // no connected admin → nothing to sync
  }

  const { data: order } = await admin
    .from('orders')
    .select(
      'id, order_number, status, archived_at, scheduled_at, duration_minutes, timezone, photographer_id, contractor_id, contractor_response, dropbox_intake_url, internal_notes, project_type, listings(address_line1, city, state, zip), clients(full_name)'
    )
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return;

  const { data: existingRows } = await admin
    .from('order_calendar_events')
    .select('id, calendar_id, event_id, role')
    .eq('order_id', orderId);
  const existing = new Map<string, { id: string; event_id: string; role: string }>();
  for (const r of existingRows ?? []) {
    existing.set(r.calendar_id, { id: r.id, event_id: r.event_id, role: r.role });
  }

  // Build the desired set of events.
  const live = order.scheduled_at && !order.archived_at && !DEAD_STATUSES.has(order.status);
  const desired: Desired[] = [];

  if (live) {
    const l = (order.listings ?? {}) as any;
    const address = l.address_line1 || `Order #${order.order_number}`;
    const start = new Date(order.scheduled_at);
    const end = new Date(start.getTime() + (order.duration_minutes ?? 60) * 60_000);
    const tz = order.timezone || 'America/New_York';
    const location = [l.address_line1, l.city, l.state, l.zip].filter(Boolean).join(', ') || undefined;

    // Resolve the shooter as ONE person, whichever id(s) the assignment set. A
    // contractor linked to a team_members row (e.g. Karen) may arrive with only
    // contractor_id set — follow the link so their scheduling identity (and any
    // Google connection on it) is found.
    let photographerId: string | null = order.photographer_id ?? null;
    let contractor: { email: string | null; full_name: string | null; team_member_id: string | null } | null =
      null;
    if (order.contractor_id) {
      const { data: ct } = await admin
        .from('contractors')
        .select('email, full_name, team_member_id')
        .eq('id', order.contractor_id)
        .maybeSingle();
      contractor = ct ?? null;
      if (!photographerId && contractor?.team_member_id) photographerId = contractor.team_member_id;
    }
    let teamMember: { email: string | null; full_name: string | null } | null = null;
    if (photographerId) {
      const { data: pm } = await admin
        .from('team_members')
        .select('email, full_name')
        .eq('id', photographerId)
        .maybeSingle();
      teamMember = pm ?? null;
    }
    const shooterEmail = (teamMember?.email || contractor?.email || '').trim().toLowerCase() || null;
    const shooterName = teamMember?.full_name || contractor?.full_name || '';
    const isContractor = Boolean(order.contractor_id) && !teamMember;

    // Does the shooter have their own Google connection? Then we can write a
    // busy hold directly with their token, no sharing or invite needed.
    let ownConn: { team_member_id: string; account_email: string | null } | null = null;
    if (photographerId) {
      const { data: c } = await admin
        .from('team_calendar_connections')
        .select('team_member_id, account_email')
        .eq('team_member_id', photographerId)
        .eq('provider', 'google')
        .eq('is_active', true)
        .maybeSingle();
      ownConn = c ?? null;
    }

    const client = (order.clients as any)?.full_name;
    const arch = order.project_type === 'architectural' ? ' [Architectural]' : '';
    const services = order.internal_notes
      ? String(order.internal_notes).replace(/^Field services:\s*/, '')
      : '';
    const shooterLabel = shooterName
      ? `${shooterName}${isContractor ? ' (contractor)' : ''}`
      : '';
    // Invite the shooter as a guest on the master unless we can write to their
    // calendar directly (own connection). Never both — that would double it up.
    const guestEmail = shooterEmail && !ownConn ? shooterEmail : null;

    // A contractor's accept / decline in the app becomes their RSVP on the
    // invite. Unanswered in the app → leave whatever they said on Google (the
    // RSVP mirror cron copies a Google answer back into the app).
    const rsvp: 'accepted' | 'declined' | undefined =
      order.contractor_id && (order.contractor_response === 'accepted' || order.contractor_response === 'declined')
        ? order.contractor_response
        : undefined;

    // Give the invited shooter their links right in the event: where to accept
    // or decline, and where to upload afterwards.
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.oceanoblue.net';
    // Deterministic per shoot (expiry keyed off the shoot date) so the
    // description — and therefore the event — doesn't change on every sync.
    const respondToken =
      guestEmail && order.contractor_id
        ? signRespondToken(orderId, order.contractor_id, respondTokenExpiry(order.scheduled_at))
        : null;
    const respondUrl = respondToken ? respondPageUrl(base, respondToken) : null;

    const description = [
      client ? `Client: ${client}` : null,
      shooterLabel ? `Shooter: ${shooterLabel}` : 'Unassigned',
      services ? `Services: ${services}` : null,
      respondUrl ? `Accept or decline: ${respondUrl}` : null,
      guestEmail && order.dropbox_intake_url ? `Upload RAWs: ${order.dropbox_intake_url}` : null,
      'Booked via Oceano Blue Ops',
    ]
      .filter(Boolean)
      .join('\n');

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // Master — every shoot, prefixed with the shooter's first name for at-a-glance.
    // FREE (transparent): it's a visible reference layer, so it never marks anyone
    // "busy". Busy comes only from the assignee's own calendar hold below.
    desired.push({
      calendarId: MASTER_CALENDAR_ID,
      role: 'master',
      actorId,
      notify: true, // guests (when any) get invites / updates / cancellations
      payload: {
        summary: `${shooterName ? shooterName.split(' ')[0] + ' · ' : ''}${address}${arch}`,
        description,
        location,
        startIso,
        endIso,
        timezone: tz,
        transparency: 'transparent',
        attendees: guestEmail ? [{ email: guestEmail, responseStatus: rsvp }] : [],
      },
    });

    // Shooter's own calendar — a BUSY hold, written with their own token.
    if (ownConn) {
      const calendarId = (ownConn.account_email || shooterEmail || '').toLowerCase();
      if (calendarId) {
        desired.push({
          calendarId,
          role: 'assignee',
          actorId: ownConn.team_member_id,
          notify: false,
          payload: {
            summary: `Shoot · ${address}${arch}`,
            description,
            location,
            startIso,
            endIso,
            timezone: tz,
            transparency: 'opaque',
            attendees: [],
          },
        });
      }
    }
  }

  const desiredByCal = new Map(desired.map((d) => [d.calendarId, d]));

  // Remove events that are no longer desired (unscheduled, cancelled, reassigned
  // away, or the shooter has since connected their own calendar).
  for (const [calId, row] of existing) {
    if (!desiredByCal.has(calId)) {
      const actor = await actorForCalendar(admin, calId, actorId);
      await deleteEvent(actor, calId, row.event_id, row.role === 'master' ? 'all' : 'none').catch(
        () => {}
      );
      await admin.from('order_calendar_events').delete().eq('id', row.id);
    }
  }

  // Create or update the desired events.
  for (const d of desired) {
    const ex = existing.get(d.calendarId);
    const sendUpdates = d.notify ? 'all' : 'none';

    if (ex) {
      // Only PATCH when something actually changed — a no-op update would still
      // ping every guest with an "updated invitation" email.
      const current = await getEvent(d.actorId, d.calendarId, ex.event_id).catch(() => null);
      if (current && current.status !== 'cancelled') {
        const payload = carryForwardRsvps(d.payload, current);
        if (!sameEvent(current, payload)) {
          await updateEvent(d.actorId, d.calendarId, ex.event_id, payload, sendUpdates).catch(
            () => {}
          );
        }
        await admin
          .from('order_calendar_events')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', ex.id);
        continue;
      }
      // The tracked event is gone (deleted by hand in Google, or never landed).
      // Drop the stale row and fall through to recreate it.
      await admin.from('order_calendar_events').delete().eq('id', ex.id);
    }

    const ev = await insertEvent(d.actorId, d.calendarId, d.payload, sendUpdates);
    if (ev?.id) {
      await admin
        .from('order_calendar_events')
        .upsert(
          { order_id: orderId, calendar_id: d.calendarId, event_id: ev.id, role: d.role },
          { onConflict: 'order_id,calendar_id' }
        );
    } else {
      logEvent('gcal.sync', 'insert_failed', { orderId, calendarId: d.calendarId, role: d.role });
    }
  }
}
