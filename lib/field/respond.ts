import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { contractorResponseEmail } from '@/lib/email/templates';
import { fmtDateTimeTz } from '@/lib/utils/format';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';
import { captureError, logEvent } from '@/lib/observability/report';

export type ContractorResponse = 'accepted' | 'declined';

/** Where an answer came from — for the office notification + logs. */
export type ResponseSource = 'portal' | 'email' | 'calendar';

/**
 * Record a contractor's accept / decline on a shoot from a SERVER path that
 * has already established who the contractor is (a signed email link, or the
 * Google Calendar RSVP mirror). The portal path uses the respond_to_assignment
 * RPC instead, which re-derives the caller from the session; this mirrors that
 * RPC's guards: their own assignment only, and only while the shoot is live.
 */
export async function recordContractorResponse(opts: {
  orderId: string;
  contractorId: string;
  response: ContractorResponse;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: 'not_your_assignment' }> {
  const admin = createAdminClient() as any;
  const note = (opts.note ?? '').trim() || null;
  const { data: updated } = await admin
    .from('orders')
    .update({
      contractor_response: opts.response,
      contractor_responded_at: new Date().toISOString(),
      contractor_response_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.orderId)
    .eq('contractor_id', opts.contractorId)
    .is('archived_at', null)
    .not('status', 'in', '(cancelled,draft)')
    .select('id')
    .maybeSingle();
  if (!updated) return { ok: false, reason: 'not_your_assignment' };

  await admin.from('assignment_events').insert({
    order_id: opts.orderId,
    contractor_id: opts.contractorId,
    event: opts.response,
    note,
  });
  return { ok: true };
}

/**
 * Everything that should happen AFTER a response is stored, whichever door it
 * came through: tell the office, and push the answer onto the Google invite so
 * the calendar and the app agree. Fail-soft — the response is already saved.
 */
export async function afterContractorResponse(opts: {
  orderId: string;
  response: ContractorResponse;
  note?: string | null;
  source: ResponseSource;
  baseUrl: string;
  /** Skip the calendar push (the answer already came FROM the calendar). */
  skipCalendar?: boolean;
}): Promise<void> {
  logEvent('field.respond', opts.response, { orderId: opts.orderId, source: opts.source });
  try {
    await notifyOffice(opts.orderId, opts.response, opts.note ?? null, opts.baseUrl, opts.source);
  } catch (e) {
    captureError('field.respond.notify', e, { orderId: opts.orderId });
  }
  if (!opts.skipCalendar) {
    try {
      await syncShootCalendar(opts.orderId);
    } catch (e) {
      captureError('field.respond.calendar', e, { orderId: opts.orderId });
    }
  }
}

/** Email + text every active admin that a shoot was accepted or declined. */
async function notifyOffice(
  orderId: string,
  response: ContractorResponse,
  note: string | null,
  baseUrl: string,
  source: ResponseSource
) {
  const admin = createAdminClient() as any;

  const { data: order } = await admin
    .from('orders')
    .select('order_number, contractor_id, scheduled_at, timezone, listings(address_line1, city, state, zip)')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return;

  const [{ data: contractor }, { data: admins }] = await Promise.all([
    order.contractor_id
      ? admin.from('contractors').select('full_name').eq('id', order.contractor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('team_members').select('email, full_name, phone').eq('role', 'admin').eq('is_active', true),
  ]);

  const adminRows = (admins ?? []) as Array<{ email: string | null; phone: string | null }>;
  const emailTo = adminRows.map((a) => a.email).filter((e): e is string => Boolean(e));
  const smsTo = adminRows.map((a) => a.phone).filter((p): p is string => Boolean(p));
  if (emailTo.length === 0 && smsTo.length === 0) return;

  const listing = (order.listings ?? {}) as any;
  const address = listing.address_line1 || `Order #${order.order_number}`;
  const who = contractor?.full_name ?? 'A photographer';
  const via = source === 'calendar' ? ' (via the calendar invite)' : source === 'email' ? ' (via email)' : '';

  const { subject, html } = contractorResponseEmail({
    contractorName: who,
    response,
    address,
    cityStateZip: [listing.city, listing.state, listing.zip].filter(Boolean).join(', ') || null,
    whenText: order.scheduled_at ? fmtDateTimeTz(order.scheduled_at, order.timezone) : null,
    note,
    orderUrl: `${baseUrl}/dashboard/orders/${orderId}`,
  });

  const smsText = `Oceano Blue: ${who} ${response} the shoot at ${address}${via}${note ? ` — "${note}"` : ''}`;

  await Promise.all([
    ...emailTo.map((to) => sendEmail({ to, subject, html })),
    ...smsTo.map((to) => sendSms({ to, text: smsText })),
  ]);
}
