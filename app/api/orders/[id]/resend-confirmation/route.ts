import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';
import { bookingConfirmationEmail } from '@/lib/email/templates';
import { fmtDateTimeTz } from '@/lib/utils/format';

/**
 * Office action: resend the client's booking confirmation to the email that's
 * on the client record right now (e.g. after fixing a typo). Team-only.
 */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: isStaff } = await supabase.rpc('is_team_member');
  if (!isStaff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient() as any;
  const { data: order, error } = await admin
    .from('orders')
    .select('id, status, archived_at, scheduled_at, timezone, assignment_state, clients(full_name, email), listings(address_line1, city, state, zip)')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not load the order.' }, { status: 503 });
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status === 'cancelled' || order.status === 'draft') {
    return NextResponse.json({ error: `This order is ${order.status}, so there's no booking to confirm.` }, { status: 409 });
  }
  if (!order.scheduled_at) return NextResponse.json({ error: 'This order has no shoot date yet.' }, { status: 409 });
  const to = order.clients?.email?.trim();
  if (!to) return NextResponse.json({ error: 'The client has no email address.' }, { status: 400 });

  const l = order.listings ?? {};
  const email = bookingConfirmationEmail({
    clientName: order.clients?.full_name || '',
    address: l.address_line1 || 'Your property',
    cityStateZip: [l.city, l.state, l.zip].filter(Boolean).join(', '),
    whenText: fmtDateTimeTz(order.scheduled_at, order.timezone),
    pending: order.assignment_state === 'awaiting_response' || order.assignment_state === 'rerouting',
  });
  const sent = await sendEmail({ to, subject: email.subject, html: email.html });
  if (sent.status !== 'sent') {
    const message = sent.status === 'failed' ? sent.error : 'Email sending is not configured.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await admin.from('activity_log').insert({
    order_id: id,
    actor_type: 'user',
    actor_id: user.id,
    action: 'booking_confirmation_resent',
    details: { to },
  });
  return NextResponse.json({ ok: true, to });
}
