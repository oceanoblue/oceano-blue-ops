import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';

const BookingSchema = z.object({
  client_email: z.string().email(),
  client_name: z.string().min(2),
  client_phone: z.string().optional().default(''),
  client_brokerage: z.string().optional().default(''),
  address_line1: z.string().min(3),
  city: z.string().min(2),
  state: z.string().length(2),
  zip: z.string().min(5),
  bedrooms: z.number().int().min(0).max(20).optional().default(0),
  bathrooms: z.number().min(0).max(20).optional().default(0),
  sqft: z.number().int().min(0).optional().default(0),
  requested_at: z.string().datetime(),
  services: z.array(z.string()).min(1),
  notes: z.string().optional().default(''),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = BookingSchema.parse(body);
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc('create_draft_order', {
      p_client_email: parsed.client_email,
      p_client_name: parsed.client_name,
      p_client_phone: parsed.client_phone,
      p_client_brokerage: parsed.client_brokerage,
      p_address_line1: parsed.address_line1,
      p_city: parsed.city,
      p_state: parsed.state,
      p_zip: parsed.zip,
      p_bedrooms: parsed.bedrooms,
      p_bathrooms: parsed.bathrooms,
      p_sqft: parsed.sqft,
      p_requested_at: parsed.requested_at,
      p_services: parsed.services,
      p_notes: parsed.notes,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ order_id: data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'validation_failed', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
