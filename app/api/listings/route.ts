import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Internal "New Listing" — the listing-first entry point for the team
 * (the public /book form remains the client-facing path that creates
 * client + listing + order in one go).
 */
const Body = z.object({
  // Either attach to an existing client, or create one inline via new_client.
  client_id: z.string().uuid().optional(),
  new_client: z
    .object({
      full_name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().default(''),
      brokerage: z.string().optional().default(''),
    })
    .optional(),
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

  const { data: isTeam } = await supabase.rpc('is_team_member');
  if (!isTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;

  const admin = createAdminClient() as any;

  // Resolve the client: use the given id, or create/reuse one from new_client.
  let clientId = b.client_id;
  if (!clientId) {
    if (!b.new_client) {
      return NextResponse.json(
        { error: 'client_required', message: 'Pick an existing client or add a new one.' },
        { status: 400 }
      );
    }
    const nc = b.new_client;
    const email = nc.email.toLowerCase().trim();
    // Reuse an existing client with this email — do NOT upsert/overwrite. An
    // email-keyed upsert would clobber the existing client's name/phone/brokerage
    // (silently "losing" a previously-added client when an email is reused or
    // left as a placeholder). Look up first; only insert when it's truly new.
    const { data: existing } = await admin
      .from('clients')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      clientId = (existing as any).id;
    } else {
      const { data: client, error: cErr } = await admin
        .from('clients')
        .insert({
          full_name: nc.full_name.trim(),
          email,
          phone: nc.phone?.trim() || null,
          brokerage: nc.brokerage?.trim() || null,
          is_archived: false,
        })
        .select('id')
        .single();
      if (cErr || !client) {
        return NextResponse.json({ error: cErr?.message ?? 'client_create_failed' }, { status: 500 });
      }
      clientId = (client as any).id;
    }
  }

  const { data: listing, error } = await admin
    .from('listings')
    .insert({
      client_id: clientId,
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
