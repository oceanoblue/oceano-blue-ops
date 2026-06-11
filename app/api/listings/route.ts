import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Internal "New Listing" — the listing-first entry point for the team
 * (the public /book form remains the client-facing path that creates
 * client + listing + order in one go).
 */
const Body = z.object({
  client_id: z.string().uuid(),
  address_line1: z.string().min(2),
  address_line2: z.string().optional().default(''),
  city: z.string().min(1),
  state: z.string().min(2),
  zip: z.string().min(3),
  mls_id: z.string().optional().default(''),
  property_type: z.string().optional().default(''),
  bedrooms: z.number().int().min(0).nullable().optional(),
  bathrooms: z.number().min(0).nullable().optional(),
  sqft: z.number().int().min(0).nullable().optional(),
  list_price: z.number().int().min(0).nullable().optional(),
  access_notes: z.string().optional().default(''),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;

  const admin = createAdminClient() as any;
  const { data: listing, error } = await admin
    .from('listings')
    .insert({
      client_id: b.client_id,
      address_line1: b.address_line1,
      address_line2: b.address_line2 || null,
      city: b.city,
      state: b.state,
      zip: b.zip,
      mls_id: b.mls_id || null,
      property_type: b.property_type || null,
      bedrooms: b.bedrooms ?? null,
      bathrooms: b.bathrooms ?? null,
      sqft: b.sqft ?? null,
      list_price: b.list_price ?? null,
      access_notes: b.access_notes || null,
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !listing) {
    return NextResponse.json({ error: error?.message ?? 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ listing_id: listing.id });
}
