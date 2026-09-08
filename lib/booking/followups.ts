import { createAdminClient } from '@/lib/supabase/server';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { bookingConfirmationEmail, bookingReceivedEmail } from '@/lib/email/templates';
import { fmtDateTimeTz } from '@/lib/utils/format';
import type { BookingInput } from './validation';

export type Followup = { id: string; order_id: string; kind: string; recipient: string; payload: BookingInput; attempts: number; lease_token: string; created_at: string };

export async function deliverFollowup(job: Followup): Promise<void> {
  if (job.kind === 'calendar') {
    await syncShootCalendar(job.order_id, { strict: true });
    return;
  }
  const b = job.payload;
  const cityStateZip = [b.city, b.state, b.zip].filter(Boolean).join(', ');
  const whenText = fmtDateTimeTz(b.scheduled_at, b.timezone);
  if (job.kind === 'office_sms') {
    const result = await sendSms({ to: job.recipient, text: `Oceano Blue: New booking — ${b.client_name}, ${b.address_line1}, ${cityStateZip} · ${whenText}` });
    if (result.status !== 'sent') throw new Error(result.status === 'failed' ? result.error : result.status);
    return;
  }
  // Resend retains idempotency keys for 24 hours. Do not automatically resend
  // an old ambiguous attempt outside that window.
  if (Date.now() - Date.parse(job.created_at) > 23 * 3600000) throw new Error('email_delivery_review_required');
  const email = job.kind === 'client_email'
    ? bookingConfirmationEmail({ clientName: b.client_name, address: b.address_line1, cityStateZip, whenText })
    : bookingReceivedEmail({ clientName: b.client_name, clientEmail: b.client_email, clientPhone: b.client_phone || null,
      address: b.address_line1, cityStateZip, whenText,
      orderUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.oceanoblue.net'}/dashboard/orders/${job.order_id}` });
  const result = await sendEmail({ to: job.recipient, subject: email.subject, html: email.html, idempotencyKey: job.id });
  if (result.status !== 'sent') throw new Error(result.status === 'failed' ? result.error : result.status);
}

export async function runBookingFollowups() {
  const admin = createAdminClient() as any;
  // A process that died during SMS delivery needs review: the provider does
  // not offer a verified deduplication contract, so replay may duplicate a text.
  const { error: interrupted } = await admin.from('booking_followups').update({ status: 'needs_review', last_error: 'Delivery interrupted; verify with provider before retrying.' })
    .eq('status', 'running').eq('kind', 'office_sms').lt('locked_at', new Date(Date.now() - 300000).toISOString());
  if (interrupted) throw interrupted;
  const { error: exhausted } = await admin.from('booking_followups').update({ status: 'failed', last_error: 'Delivery interrupted after the final attempt; review required.' })
    .eq('status', 'running').gte('attempts', 6).lt('locked_at', new Date(Date.now() - 300000).toISOString());
  if (exhausted) throw exhausted;
  const { data, error } = await admin.rpc('claim_booking_followups', { p_limit: 3 });
  if (error) throw error;
  return Promise.all((data || []).map(async (job: Followup) => {
    let status = 'complete';
    let message: string | null = null;
    try { await deliverFollowup(job); }
    catch (error) {
      message = error instanceof Error ? error.message : 'Delivery failed';
      status = job.kind === 'office_sms' || message === 'email_delivery_review_required' ? 'needs_review' : job.attempts >= 6 ? 'failed' : 'pending';
    }
    const { error: saved } = await admin.from('booking_followups').update({ status, last_error: message?.slice(0, 500) || null,
      completed_at: status === 'complete' ? new Date().toISOString() : null,
      available_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000).toISOString(), locked_at: null })
      .eq('id', job.id).eq('lease_token', job.lease_token);
    if (saved) throw saved;
    return { id: job.id, status };
  }));
}
