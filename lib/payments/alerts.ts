import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { paymentReceivedEmail, paymentReceivedSms } from '@/lib/email/templates';
import { captureError } from '@/lib/observability/report';

export type PaymentAlert = {
  id: string; order_id: string; channel: 'email' | 'sms'; destination: string;
  content: { orderNumber: number; amountCents: number; paidAt: string; clientName: string; address: string };
};

/** Claims are durable before any provider call. No automatic replay of ambiguous sends. */
export async function runPaymentAlerts() {
  // Preview deployments can share production data; they must never send alerts.
  if (process.env.VERCEL_ENV !== 'production') return { skipped: true, accepted: 0, review: 0 };
  const db = createAdminClient({ noStore: true }) as any;
  let accepted = 0, review = 0;
  for (let i = 0; i < 4; i++) {
    const { data, error } = await db.rpc('claim_payment_alert');
    if (error) throw new Error('Could not claim payment alert.');
    const alert = data?.[0] as PaymentAlert | undefined;
    if (!alert) break;
    const content = { ...alert.content, orderUrl: `https://app.oceanoblue.net/dashboard/orders/${alert.order_id}` };
    let result: { status: string; id?: string };
    try {
      result = alert.channel === 'email'
        ? await sendEmail({ to: alert.destination, ...paymentReceivedEmail(content), idempotencyKey: `payment-alert/${alert.id}` })
        : await sendSms({ to: alert.destination, text: paymentReceivedSms(content) });
    } catch {
      result = { status: 'failed' };
    }
    const status = result.status === 'sent' ? 'accepted'
      : ['not_configured', 'skipped'].includes(result.status) ? 'failed' : 'needs_review';
    const { error: saveError } = await db.from('payment_alerts').update({
      status, provider_id: result.id || null, completed_at: new Date().toISOString(),
      error: status === 'accepted' ? null : status === 'failed'
        ? 'Channel is not configured or destination is invalid.'
        : 'Provider acceptance was not confirmed. Check the provider before retrying.',
    }).eq('id', alert.id).eq('status', 'sending');
    if (saveError) throw new Error('Could not record payment alert result; inspect provider before retrying.');
    if (status === 'accepted') accepted++;
    else { review++; captureError('payments.ownerAlert', new Error('Payment alert requires review.'), { alertId: alert.id, channel: alert.channel }); }
  }
  return { accepted, review };
}
