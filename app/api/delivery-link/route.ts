import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { generateDeliveryToken } from '@/lib/utils/delivery-token';
import { sendEmail } from '@/lib/email/resend';
import { galleryReadyEmail } from '@/lib/email/templates';

/**
 * Email the "gallery ready" link to the order's client and every teammate on a
 * shared team who opted into delivery notifications. Best-effort: never blocks
 * or fails delivery (email is not configured until the sending domain lands).
 */
async function notifyClientAndTeam(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  galleryUrl: string
) {
  try {
    const { data: ord } = await (supabase.from('orders') as any)
      .select('client_id, listings:listing_id(address_line1, city, state, zip)')
      .eq('id', orderId)
      .maybeSingle();
    if (!ord?.client_id) return;

    const l = ord.listings ?? {};
    const address = l.address_line1 || 'Your listing';
    const cityStateZip = [l.city, l.state, l.zip].filter(Boolean).join(', ') || null;

    // Recipients: the order's client (always) + opted-in teammates.
    const { data: owner } = await (supabase.from('clients') as any)
      .select('email, full_name')
      .eq('id', ord.client_id)
      .maybeSingle();

    const { data: teamRows } = await (supabase as any).from('client_team_members')
      .select('team_id')
      .eq('client_id', ord.client_id);
    const teamIds = (teamRows ?? []).map((r: any) => r.team_id);

    const recipients = new Map<string, string | null>(); // email -> name
    if (owner?.email) recipients.set(owner.email, owner.full_name);
    if (teamIds.length) {
      const { data: mates } = await (supabase as any).from('client_team_members')
        .select('client:client_id(email, full_name)')
        .in('team_id', teamIds)
        .eq('notify_on_delivery', true)
        .neq('client_id', ord.client_id);
      for (const m of mates ?? []) {
        const c = m.client;
        if (c?.email && !recipients.has(c.email)) recipients.set(c.email, c.full_name);
      }
    }

    await Promise.allSettled(
      [...recipients.entries()].map(([email, name]) => {
        const { subject, html } = galleryReadyEmail({ recipientName: name, address, cityStateZip, galleryUrl });
        return sendEmail({ to: email, subject, html });
      })
    );
  } catch {
    /* best-effort — delivery already succeeded */
  }
}

const Body = z.object({
  order_id: z.string().uuid(),
  expires_at: z.string().datetime().optional(),
});

/** Generate a new delivery link for an order. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const token = generateDeliveryToken();
  const { data, error } = await supabase
    .from('delivery_links')
    .insert({
      order_id: parsed.data.order_id,
      token,
      expires_at: parsed.data.expires_at,
      created_by: user.id,
    })
    .select('id, token')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', parsed.data.order_id);

  // Advance the listing too, so the listing-first view reflects delivery.
  const { data: ord } = await supabase
    .from('orders')
    .select('listing_id')
    .eq('id', parsed.data.order_id)
    .maybeSingle();
  if ((ord as any)?.listing_id) {
    await (supabase.from('listings') as any).update({ status: 'delivered' }).eq('id', (ord as any).listing_id);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const url = `${base}/gallery/${data.token}`;
  await notifyClientAndTeam(supabase, parsed.data.order_id, url);
  return NextResponse.json({ id: data.id, token: data.token, url });
}
