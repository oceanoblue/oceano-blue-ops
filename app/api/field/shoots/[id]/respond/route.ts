import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { contractorResponseEmail } from '@/lib/email/templates';
import { fmtDateTime } from '@/lib/utils/format';

/**
 * Contractor accepts or declines their assigned shoot. The state change goes
 * through respond_to_assignment() (SECURITY DEFINER — re-derives the caller's
 * contractor and enforces "your own assignment"), so this route is safe under
 * the public /api/field prefix. On success it emails every active admin so the
 * office knows the moment a shoot is taken or turned down.
 */
const Body = z.object({
  response: z.enum(['accepted', 'declined']),
  note: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });

  // Ownership + the write are enforced inside the RPC.
  const { data, error } = await supabase.rpc('respond_to_assignment', {
    p_order_id: params.id,
    p_response: parsed.data.response,
    p_note: parsed.data.note?.trim() || undefined,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const res = data as { ok?: boolean; reason?: string } | null;
  if (!res?.ok) {
    const reason = res?.reason;
    const msg =
      reason === 'not_your_assignment'
        ? "This shoot isn't assigned to you."
        : reason === 'no_contractor_for_this_login'
          ? 'Your account isn’t registered as a photographer yet.'
          : reason || 'Could not save your response.';
    return NextResponse.json({ error: msg, reason }, { status: 400 });
  }

  // Fire the admin notification. Never let an email hiccup fail the response —
  // the accept/decline is already committed.
  try {
    await notifyAdmins(params.id, parsed.data.response, parsed.data.note ?? null, request);
  } catch (e) {
    console.error('[field/respond] admin notify failed:', e);
  }

  return NextResponse.json({ ok: true, response: parsed.data.response });
}

async function notifyAdmins(
  orderId: string,
  response: 'accepted' | 'declined',
  note: string | null,
  request: Request
) {
  const admin = createAdminClient() as any;

  const { data: order } = await admin
    .from('orders')
    .select('order_number, contractor_id, scheduled_at, listings(address_line1, city, state, zip)')
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
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const who = contractor?.full_name ?? 'A photographer';

  const { subject, html } = contractorResponseEmail({
    contractorName: who,
    response,
    address,
    cityStateZip: [listing.city, listing.state, listing.zip].filter(Boolean).join(', ') || null,
    whenText: order.scheduled_at ? fmtDateTime(order.scheduled_at) : null,
    note,
    orderUrl: `${base}/dashboard/orders/${orderId}`,
  });

  const smsText = `Oceano Blue: ${who} ${response} the shoot at ${address}${note ? ` — "${note}"` : ''}`;

  await Promise.all([
    ...emailTo.map((to) => sendEmail({ to, subject, html })),
    ...smsTo.map((to) => sendSms({ to, text: smsText })),
  ]);
}
