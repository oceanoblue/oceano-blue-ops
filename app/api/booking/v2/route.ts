import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { insertEvent } from '@/lib/google-calendar/api';
import { enforceRateLimit } from '@/lib/security/rate-limit';

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
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort: stamp the photographer onto the order. Done as a separate
  // update so the RPC signature stays stable.
  if (b.photographer_id) {
    await supabase
      .from('orders')
      .update({ photographer_id: b.photographer_id })
      .eq('id', data);

    // Push to the photographer's Google Calendar (best-effort).
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
  return NextResponse.json({ order_id: data });
}
