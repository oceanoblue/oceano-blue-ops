import { createAdminClient } from '@/lib/supabase/server';
import { insertEvent, updateEvent, deleteEvent, type EventPayload } from './api';

// The master "office" calendar that shows EVERY shoot. Shared with the connected
// admin account so one token can write it. Override with env if it ever changes.
const MASTER_CALENDAR_ID = process.env.MASTER_CALENDAR_ID || 'info@oceanoblue.net';

// Statuses / states that mean "this shoot should NOT be on any calendar".
const DEAD_STATUSES = new Set(['cancelled', 'draft']);

/** The connected admin whose token writes all the (shared) office calendars. */
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

/** Delete every calendar event tracked for an order (call BEFORE deleting the order). */
export async function removeShootCalendar(orderId: string): Promise<void> {
  const admin = createAdminClient() as any;
  const actorId = await getActorId(admin);
  const { data: rows } = await admin
    .from('order_calendar_events')
    .select('id, calendar_id, event_id')
    .eq('order_id', orderId);
  for (const r of rows ?? []) {
    if (actorId) await deleteEvent(actorId, r.calendar_id, r.event_id).catch(() => {});
  }
  await admin.from('order_calendar_events').delete().eq('order_id', orderId);
}

/**
 * Reconcile an order's Google Calendar events across the office calendars:
 *   - MASTER (info@): every scheduled shoot — the team's full schedule.
 *   - ASSIGNEE (the shooter's own calendar): the shoot as BUSY, only on the
 *     assigned team photographer's calendar. So the owner sees everyone's shoots
 *     on the master (free/visible), but only their own shoots block their time.
 *
 * All writes authenticate as a connected admin whose account the master + shared
 * photographer calendars are shared with, so a single token drives them all.
 * Fail-soft: any Google hiccup is swallowed so it never breaks the caller.
 */
export async function syncShootCalendar(orderId: string): Promise<void> {
  const admin = createAdminClient() as any;

  // Pick the actor: an active admin with a Google connection.
  const actorId = await getActorId(admin);
  if (!actorId) return; // no connected admin → nothing to sync

  const { data: order } = await admin
    .from('orders')
    .select(
      'id, order_number, status, archived_at, scheduled_at, duration_minutes, timezone, photographer_id, contractor_id, internal_notes, project_type, listings(address_line1, city, state, zip), clients(full_name)'
    )
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return;

  const { data: existingRows } = await admin
    .from('order_calendar_events')
    .select('id, calendar_id, event_id')
    .eq('order_id', orderId);
  const existing = new Map<string, { id: string; event_id: string }>();
  for (const r of existingRows ?? []) existing.set(r.calendar_id, { id: r.id, event_id: r.event_id });

  // Build the desired set of events.
  const live = order.scheduled_at && !order.archived_at && !DEAD_STATUSES.has(order.status);
  const desired: { calendarId: string; role: 'master' | 'assignee'; payload: EventPayload }[] = [];

  if (live) {
    const l = (order.listings ?? {}) as any;
    const address = l.address_line1 || `Order #${order.order_number}`;
    const start = new Date(order.scheduled_at);
    const end = new Date(start.getTime() + (order.duration_minutes ?? 60) * 60_000);
    const tz = order.timezone || 'America/New_York';
    const location = [l.address_line1, l.city, l.state, l.zip].filter(Boolean).join(', ') || undefined;

    let shooterEmail: string | null = null;
    let shooterName = '';
    if (order.photographer_id) {
      const { data: pm } = await admin
        .from('team_members')
        .select('email, full_name')
        .eq('id', order.photographer_id)
        .maybeSingle();
      shooterEmail = pm?.email ?? null;
      shooterName = pm?.full_name ?? '';
    } else if (order.contractor_id) {
      const { data: ct } = await admin
        .from('contractors')
        .select('full_name')
        .eq('id', order.contractor_id)
        .maybeSingle();
      shooterName = ct?.full_name ? `${ct.full_name} (contractor)` : 'Contractor';
    }

    const client = (order.clients as any)?.full_name;
    const arch = order.project_type === 'architectural' ? ' [Architectural]' : '';
    const services = order.internal_notes
      ? String(order.internal_notes).replace(/^Field services:\s*/, '')
      : '';
    const description = [
      client ? `Client: ${client}` : null,
      shooterName ? `Shooter: ${shooterName}` : 'Unassigned',
      services ? `Services: ${services}` : null,
      'Booked via Oceano Blue Ops',
    ]
      .filter(Boolean)
      .join('\n');

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // Master — every shoot, prefixed with the shooter's first name for at-a-glance.
    desired.push({
      calendarId: MASTER_CALENDAR_ID,
      role: 'master',
      payload: {
        summary: `${shooterName ? shooterName.split(' ')[0] + ' · ' : ''}${address}${arch}`,
        description,
        location,
        startIso,
        endIso,
        timezone: tz,
        transparency: 'opaque',
      },
    });

    // Assignee's own calendar — busy, only when a team photographer is assigned.
    // (Contractors have no calendar; their shoots live on the master only.)
    if (shooterEmail) {
      desired.push({
        calendarId: shooterEmail,
        role: 'assignee',
        payload: {
          summary: `Shoot · ${address}${arch}`,
          description,
          location,
          startIso,
          endIso,
          timezone: tz,
          transparency: 'opaque',
        },
      });
    }
  }

  const desiredByCal = new Map(desired.map((d) => [d.calendarId, d]));

  // Remove events that are no longer desired (unscheduled, cancelled, reassigned away).
  for (const [calId, row] of existing) {
    if (!desiredByCal.has(calId)) {
      await deleteEvent(actorId, calId, row.event_id).catch(() => {});
      await admin.from('order_calendar_events').delete().eq('id', row.id);
    }
  }

  // Create or update the desired events.
  for (const d of desired) {
    const ex = existing.get(d.calendarId);
    if (ex) {
      await updateEvent(actorId, d.calendarId, ex.event_id, d.payload).catch(() => {});
      await admin.from('order_calendar_events').update({ updated_at: new Date().toISOString() }).eq('id', ex.id);
    } else {
      const ev = await insertEvent(actorId, d.calendarId, d.payload);
      if (ev?.id) {
        await admin
          .from('order_calendar_events')
          .upsert(
            { order_id: orderId, calendar_id: d.calendarId, event_id: ev.id, role: d.role },
            { onConflict: 'order_id,calendar_id' }
          );
      }
    }
  }
}
