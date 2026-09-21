import { createAdminClient } from '@/lib/supabase/server';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { appointmentRescheduledEmail, bookingConfirmationEmail, bookingReceivedEmail, assignmentRequestEmail, assignmentOfficeEmail } from '@/lib/email/templates';
import { signRespondToken, respondPageUrl, respondTokenExpiry } from '@/lib/field/respond-token';
import { fmtDateTimeTz, fmtCents } from '@/lib/utils/format';
import type { BookingInput } from './validation';

export type Followup = { id: string; order_id: string; kind: string; recipient: string; payload: BookingInput & { event?: 'rescheduled' | 'assignment_pending' | 'assignment_confirmed'; pending?: boolean; previous_scheduled_at?: string; assignment_round?: number; contractor_id?: string; assignment_state?: string; assignment_due_at?: string }; attempts: number; lease_token: string; created_at: string };

export async function deliverFollowup(job: Followup): Promise<void> {
  if (job.kind === 'calendar') {
    await syncShootCalendar(job.order_id, { strict: true });
    return;
  }
  const b = job.payload;
  const base=process.env.NEXT_PUBLIC_APP_URL || 'https://app.oceanoblue.net';
  if(job.kind==='assignment_email'||job.kind==='assignment_sms'||b.event==='assignment_pending'||b.event==='assignment_confirmed'||b.event==='rescheduled'||job.kind==='office_attention') {
    const admin=createAdminClient() as any;
    const {data:order,error}=await admin.from('orders').select('assignment_round,assignment_state,assignment_due_at,contractor_id,archived_at,status,pay_amount_cents,contractors(full_name),order_items(description,quantity)').eq('id',job.order_id).maybeSingle();
    if(error)throw error;
    if(!order||order.archived_at||['cancelled','draft','delivered'].includes(order.status))return;
    if(job.kind==='office_attention' && (order.assignment_round!==b.assignment_round||order.assignment_state!==b.assignment_state))return;
    if(b.event==='assignment_confirmed' && (order.assignment_state!=='confirmed'||order.assignment_round!==b.assignment_round))return;
    if(b.event==='assignment_pending' && (order.assignment_state==='confirmed'||order.assignment_round!==b.assignment_round))return;
    if(b.event==='rescheduled' && b.assignment_round && order.assignment_round!==b.assignment_round)return;
    if(job.kind.startsWith('assignment_')) {
      if(order.assignment_state!=='awaiting_response'||order.assignment_round!==b.assignment_round||order.contractor_id!==b.contractor_id||Date.parse(order.assignment_due_at)<=Date.now())return;
      const token=signRespondToken(job.order_id,order.contractor_id,respondTokenExpiry(b.scheduled_at),order.assignment_round);
      if(!token)throw new Error('assignment_link_not_configured');
      const respondUrl=respondPageUrl(base,token);
      if(job.kind==='assignment_sms') {
        const result=await sendSms({to:job.recipient,text:`Oceano Blue: shoot request at ${b.address_line1}, ${fmtDateTimeTz(b.scheduled_at,b.timezone)}. Please accept or decline: ${respondUrl}`});
        if(result.status!=='sent')throw new Error(result.status==='failed'?result.error:result.status);
        return;
      }
      if(Date.now()-Date.parse(job.created_at)>23*3600000)throw new Error('email_delivery_review_required');
      const email=assignmentRequestEmail({name:order.contractors?.full_name||'Photographer',address:b.address_line1,when:fmtDateTimeTz(b.scheduled_at,b.timezone),deadline:fmtDateTimeTz(order.assignment_due_at,b.timezone),services:(order.order_items||[]).map((i:any)=>`${i.quantity} × ${i.description}`).join(', '),pay:order.pay_amount_cents?fmtCents(order.pay_amount_cents):'',respondUrl,portalUrl:`${base}/field/shoots/${job.order_id}`});
      const sent=await sendEmail({to:job.recipient,...email,idempotencyKey:job.id});
      if(sent.status!=='sent')throw new Error(sent.status==='failed'?sent.error:sent.status);
      return;
    }
  }
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
  const email = job.kind === 'office_attention'
    ? assignmentOfficeEmail({address:b.address_line1,when:whenText,url:`${base}/dashboard/orders/${job.order_id}`,confirmed:b.assignment_state==='confirmed'})
    : b.event === 'rescheduled'
    ? appointmentRescheduledEmail({ clientName: b.client_name, address: b.address_line1, whenText, previousText: b.previous_scheduled_at ? fmtDateTimeTz(b.previous_scheduled_at, b.timezone) : '', office: job.kind === 'office_email', pending:b.pending })
    : job.kind === 'client_email'
    ? bookingConfirmationEmail({ clientName: b.client_name, address: b.address_line1, cityStateZip, whenText, pending:b.event==='assignment_pending' })
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
    .eq('status', 'running').in('kind', ['office_sms','assignment_sms']).lt('locked_at', new Date(Date.now() - 300000).toISOString());
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
      status = ['office_sms','assignment_sms'].includes(job.kind) || message === 'email_delivery_review_required' ? 'needs_review' : job.attempts >= 6 ? 'failed' : 'pending';
    }
    const { error: saved } = await admin.from('booking_followups').update({ status, last_error: message?.slice(0, 500) || null,
      completed_at: status === 'complete' ? new Date().toISOString() : null,
      available_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000).toISOString(), locked_at: null })
      .eq('id', job.id).eq('lease_token', job.lease_token);
    if (saved) throw saved;
    return { id: job.id, status };
  }));
}
