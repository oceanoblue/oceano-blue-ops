import { createAdminClient } from '@/lib/supabase/server';
import { getEvent } from './api';
import { recordContractorResponse, afterContractorResponse } from '@/lib/field/respond';
import { captureError, logEvent } from '@/lib/observability/report';

const MASTER_CALENDAR_ID = process.env.MASTER_CALENDAR_ID || 'info@oceanoblue.net';

/**
 * Google → app. A contractor who answers the calendar invite (Yes / No in
 * Gmail) has answered the shoot — copy that into contractor_response so the
 * office is notified and the portal agrees, exactly as if they'd tapped the
 * button in the email. Only fills in an UNANSWERED shoot; an answer given in
 * the app always wins (the sync pushes it onto the invite).
 *
 * Runs from a cron. Cheap: one Calendar GET per unanswered upcoming shoot.
 */
export async function mirrorGuestRsvps(opts: { baseUrl: string }): Promise<{
  checked: number;
  mirrored: number;
}> {
  const admin = createAdminClient() as any;

  // The connected admin whose token reads the master calendar.
  const { data: admins } = await admin.from('team_members').select('id').eq('role', 'admin').eq('is_active', true);
  const adminIds = (admins ?? []).map((a: any) => a.id);
  const { data: conn } = adminIds.length
    ? await admin
        .from('team_calendar_connections')
        .select('team_member_id')
        .eq('provider', 'google')
        .eq('is_active', true)
        .in('team_member_id', adminIds)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const actorId = conn?.team_member_id as string | undefined;
  if (!actorId) return { checked: 0, mirrored: 0 };

  // Unanswered, upcoming, contractor-assigned shoots that have a master event.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: orders } = await admin
    .from('orders')
    .select('id, contractor_id, contractors(email), order_calendar_events(calendar_id, event_id)')
    .not('contractor_id', 'is', null)
    .is('contractor_response', null)
    .is('archived_at', null)
    .not('status', 'in', '(cancelled,draft)')
    .gte('scheduled_at', since);

  let checked = 0;
  let mirrored = 0;
  for (const o of orders ?? []) {
    const email = String(o.contractors?.email ?? '').trim().toLowerCase();
    const master = (o.order_calendar_events ?? []).find((e: any) => e.calendar_id === MASTER_CALENDAR_ID);
    if (!email || !master) continue;
    checked += 1;
    try {
      const ev = await getEvent(actorId, master.calendar_id, master.event_id);
      const guest = ev?.attendees.find((a) => a.email === email);
      const answer =
        guest?.responseStatus === 'accepted' ? 'accepted' : guest?.responseStatus === 'declined' ? 'declined' : null;
      if (!answer) continue;

      const res = await recordContractorResponse({ orderId: o.id, contractorId: o.contractor_id, response: answer });
      if (!res.ok) continue;
      mirrored += 1;
      logEvent('gcal.rsvp', 'mirrored', { orderId: o.id, answer });
      // The answer came FROM the calendar, so there's nothing to push back.
      await afterContractorResponse({
        orderId: o.id,
        response: answer,
        source: 'calendar',
        baseUrl: opts.baseUrl,
        skipCalendar: true,
      });
    } catch (e) {
      captureError('gcal.rsvp', e, { orderId: o.id });
    }
  }
  return { checked, mirrored };
}
