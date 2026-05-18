import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';

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
    p_lat: b.lat ?? null,
    p_lng: b.lng ?? null,
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
  }
  return NextResponse.json({ order_id: data });
}
