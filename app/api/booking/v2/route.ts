import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { insertEvent } from '@/lib/google-calendar/api';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { bookingConfirmationEmail, bookingReceivedEmail } from '@/lib/email/templates';
import { fmtDateTimeTz } from '@/lib/utils/format';

const Body = z.object({
  client_email: z.string().email(),
  client_name: z.string().min(1),
  client_phone: z.string().optional().default(''),
  client_brokerage: z.string().optional().default(''),

  address_line1: z.string().min(2),
  address_line2: z.string().optional().default(''),
  city: z.string().min(1),
  state: z.string().min(2),
  zip: z.string().min(3),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  sqft: z.number().int().min(0),

  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15),
  timezone: z.string().default('America/New_York'),
  photographer_id: z.string().uuid().nullable().optional(),

  access_method: z.string().optional().default(''),
  highlights: z.string().optional().default(''),

  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).default(1),
      })
    )
    .min(1),
});

export async function POST(request: Request) {
  // Public, unauthenticated endpoint — throttle per IP (creates rows + pushes a
  // calendar event). 5 bookings / 10 min is generous for a real client.
  const limited = await enforceRateLimit(request, 'booking_v2', 5, 600);
  if (limited) return limited;

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const b = parsed.data;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('create_booking_v2', {
    p_client_email: b.client_email,
    p_client_name: b.client_name,
    p_client_phone: b.client_phone,
    p_client_brokerage: b.client_brokerage,
    p_address_line1: b.address_line1,
    p_address_line2: b.address_line2,
    p_city: b.city,
    p_state: b.state,
    p_zip: b.zip,
    // SQL accepts NULL (double precision); generated RPC arg type is non-null.
    p_lat: (b.lat ?? null) as number,
    p_lng: (b.lng ?? null) as number,
    p_sqft: b.sqft,
    p_scheduled_at: b.scheduled_at,
    p_duration_minutes: b.duration_minutes,
    p_timezone: b.timezone,
    p_access_method: b.access_method,
    p_highlights: b.highlights,
    p_items: b.items,
    // Assign the photographer inside the RPC transaction so the double-book
    // guard runs atomically — a conflict rolls the whole booking back.
    p_photographer_id: (b.photographer_id ?? null) as string,
  });
  if (error) {
    // The DB guard raises SQLSTATE 23P01 (exclusion_violation) when the slot is
    // already taken — surface that as a 409 the booking UI can act on, not a 500.
    const conflict =
      (error as any).code === '23P01' || /slot_unavailable/i.test(error.message);
    if (conflict) {
      return NextResponse.json(
        { error: 'slot_unavailable', message: 'That time was just taken — please pick another slot.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Push to the photographer's Google Calendar (best-effort). The photographer
  // is already stamped on the order by the RPC above.
  if (b.photographer_id) {
    try {
      const start = new Date(b.scheduled_at);
      const end = new Date(start.getTime() + b.duration_minutes * 60_000);
      const ev = await insertEvent(b.photographer_id, {
        summary: `Shoot · ${b.address_line1}`,
        description: [
          `Client: ${b.client_name} <${b.client_email}>`,
          b.client_phone ? `Phone: ${b.client_phone}` : null,
          b.access_method ? `Access: ${b.access_method}` : null,
          b.highlights ? `Highlights: ${b.highlights}` : null,
          `\nBooked via Oceano Blue Ops.`,
        ]
          .filter(Boolean)
          .join('\n'),
        location: `${b.address_line1}, ${b.city}, ${b.state} ${b.zip}`,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        timezone: b.timezone,
      });
      if (ev?.id) {
        await supabase.from('orders').update({ gcal_event_id: ev.id }).eq('id', data);
      }
    } catch {
      // Calendar push is a nice-to-have; don't fail the booking.
    }
  }
  // Confirm to the client + alert the office (email + text). Fail-soft — a
  // notification hiccup must never fail a booking that already committed.
  try {
    await notifyBooking(data as string, b, request, supabase);
  } catch (e) {
    console.error('[booking] notify failed:', e);
  }

  return NextResponse.json({ order_id: data });
}

async function notifyBooking(
  orderId: string,
  b: z.infer<typeof Body>,
  request: Request,
  admin: ReturnType<typeof createAdminClient>
) {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const cityStateZip = [b.city, b.state, b.zip].filter(Boolean).join(', ') || null;
  const whenText = fmtDateTimeTz(b.scheduled_at, b.timezone);

  // 1) Client booking confirmation.
  const clientMail = bookingConfirmationEmail({
    clientName: b.client_name,
    address: b.address_line1,
    cityStateZip,
    whenText,
  });
  await sendEmail({ to: b.client_email, subject: clientMail.subject, html: clientMail.html });

  // 2) Office alert to every active admin — email + text.
  const { data: admins } = await (admin as any)
    .from('team_members')
    .select('email, phone')
    .eq('role', 'admin')
    .eq('is_active', true);
  const rows = (admins ?? []) as Array<{ email: string | null; phone: string | null }>;
  const emailTo = rows.map((a) => a.email).filter((e): e is string => Boolean(e));
  const smsTo = rows.map((a) => a.phone).filter((p): p is string => Boolean(p));

  const officeMail = bookingReceivedEmail({
    clientName: b.client_name,
    clientEmail: b.client_email,
    clientPhone: b.client_phone || null,
    address: b.address_line1,
    cityStateZip,
    whenText,
    orderUrl: `${base}/dashboard/orders/${orderId}`,
  });
  const smsText = `Oceano Blue: New booking — ${b.client_name}, ${b.address_line1}${cityStateZip ? ', ' + cityStateZip : ''} · ${whenText}`;

  await Promise.all([
    ...emailTo.map((to) => sendEmail({ to, subject: officeMail.subject, html: officeMail.html })),
    ...smsTo.map((to) => sendSms({ to, text: smsText })),
  ]);
}
