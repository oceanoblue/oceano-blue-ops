import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { contractorResponseEmail } from '@/lib/email/templates';
import { fmtDateTimeTz } from '@/lib/utils/format';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';
import { captureError, logEvent } from '@/lib/observability/report';

export type ContractorResponse = 'accepted' | 'declined';
export type ResponseResult =
  | { ok: true; changed: false }
  | { ok: true; changed: true; eventKey: string; contractorId: string; round: number }
  | { ok: false; reason: 'not_your_assignment' };

/** Where an answer came from — for the office notification + logs. */
export type ResponseSource = 'portal' | 'email' | 'calendar';

/**
 * Record a contractor's accept / decline on a shoot from a SERVER path that
 * has already established who the contractor is (a signed email link, or the
 * Google Calendar RSVP mirror, or authenticated portal). Each caller supplies
 * the assignment version so a delayed response cannot confirm a replacement.
 */
export async function recordContractorResponse(opts: {
  orderId: string;
  contractorId: string;
  response: ContractorResponse;
  note?: string | null;
  round: number;
  /** Calendar reads must never overwrite a response made in the app. */
  onlyIfUnanswered?: boolean;
}): Promise<ResponseResult> {
  const admin = createAdminClient() as any;
  const note = (opts.note ?? '').trim() || null;
  let update = admin
    .from('orders')
    .update({
      contractor_response: opts.response,
      contractor_responded_at: new Date().toISOString(),
      contractor_response_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.orderId)
    .eq('contractor_id', opts.contractorId)
    .eq('assignment_round', opts.round)
    .is('archived_at', null)
    .not('status', 'in', '(cancelled,draft)')
    .select('id, contractor_responded_at');
  // This condition is evaluated by Postgres in the UPDATE itself, including
  // after a competing writer releases the row lock. Only one request wins.
  update = opts.onlyIfUnanswered
    ? update.is('contractor_response', null)
    : update.or(`contractor_response.is.null,contractor_response.neq.${opts.response}`);
  const {data:updated,error}=await update.maybeSingle();
  if(error && !/assignment_expired/.test(error.message))throw error;
  if (!updated) {
    if (error) return { ok: false, reason: 'not_your_assignment' };
    const { data: current, error: readError } = await admin.from('orders')
      .select('contractor_response').eq('id', opts.orderId)
      .eq('contractor_id', opts.contractorId).eq('assignment_round', opts.round)
      .is('archived_at', null).not('status', 'in', '(cancelled,draft)').maybeSingle();
    if (readError) throw readError;
    return current?.contractor_response === opts.response
      ? { ok: true, changed: false }
      : { ok: false, reason: 'not_your_assignment' };
  }

  await admin.from('assignment_events').insert({
    order_id: opts.orderId,
    contractor_id: opts.contractorId,
    event: opts.response,
    note,
  });
  return { ok: true, changed: true, contractorId: opts.contractorId, round: opts.round,
    eventKey: `contractor-response/${opts.orderId}/${opts.round}/${opts.response}/${updated.contractor_responded_at}` };
}

/**
 * Everything that should happen AFTER a response is stored, whichever door it
 * came through: tell the office, and push the answer onto the Google invite so
 * the calendar and the app agree. Fail-soft — the response is already saved.
 */
export async function afterContractorResponse(opts: {
  orderId: string;
  result: ResponseResult;
  response: ContractorResponse;
  note?: string | null;
  source: ResponseSource;
  baseUrl: string;
  /** Skip the calendar push (the answer already came FROM the calendar). */
  skipCalendar?: boolean;
}): Promise<void> {
  if (!opts.result.ok || !opts.result.changed) return;
  logEvent('field.respond', opts.response, { orderId: opts.orderId, source: opts.source });
  try {
    await notifyOffice(opts.orderId, opts.response, opts.note ?? null, opts.baseUrl, opts.source, opts.result);
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
  source: ResponseSource,
  result: Extract<ResponseResult, { changed: true }>
) {
  const admin = createAdminClient() as any;

  const { data: order } = await admin
    .from('orders')
    .select('order_number, contractor_id, scheduled_at, timezone, listings(address_line1, city, state, zip)')
    .eq('id', orderId)
    .eq('contractor_id', result.contractorId)
    .eq('assignment_round', result.round)
    .maybeSingle();
  if (!order) return;

  const [{ data: contractor }, { data: admins }] = await Promise.all([
    order.contractor_id
      ? admin.from('contractors').select('full_name').eq('id', order.contractor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('team_members').select('email, full_name, phone').eq('role', 'admin').eq('is_active', true),
  ]);

  const adminRows = (admins ?? []) as Array<{ email: string | null; phone: string | null }>;
  const emailTo = [...new Set(adminRows.map((a) => a.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e)))];
  const smsTo = [...new Set(adminRows.map((a) => a.phone?.trim()).filter((p): p is string => Boolean(p)))];
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
    ...emailTo.map((to) => sendEmail({ to, subject, html, idempotencyKey: `${result.eventKey}/${createHash('sha256').update(to).digest('hex').slice(0, 16)}` })),
    ...smsTo.map((to) => sendSms({ to, text: smsText })),
  ]);
}
