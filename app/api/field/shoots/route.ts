import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Log a new field shoot for the signed-in contractor. Ownership is re-derived
 * inside the create_field_shoot() RPC (SECURITY DEFINER) from the session —
 * the caller never supplies a contractor_id.
 */
const Body = z.object({
  address_line1: z.string().min(1),
  address_line2: z.string().optional(),
  city: z.string().default(''),
  state: z.string().default(''),
  zip: z.string().default(''),
  property_type: z.string().optional(),
  bedrooms: z.number().int().nonnegative().optional(),
  bathrooms: z.number().nonnegative().optional(),
  sqft: z.number().int().nonnegative().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  access_notes: z.string().optional(),
  services: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const b = parsed.data;

  const { data: orderId, error } = await supabase.rpc('create_field_shoot', {
    p_address_line1: b.address_line1,
    p_city: b.city,
    p_state: b.state,
    p_zip: b.zip,
    p_address_line2: b.address_line2,
    p_property_type: b.property_type,
    p_bedrooms: b.bedrooms,
    p_bathrooms: b.bathrooms,
    p_sqft: b.sqft,
    p_lat: b.lat,
    p_lng: b.lng,
    p_access_notes: b.access_notes,
    p_services: b.services,
  });

  if (error) {
    const msg = error.message.includes('not_a_contractor')
      ? 'Your account isn’t registered as a photographer yet.'
      : error.message.includes('address_required')
        ? 'A property address is required.'
        : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ order_id: orderId });
}
