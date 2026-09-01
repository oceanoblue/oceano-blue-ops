import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createPhotoIntakeRequest } from '@/lib/integrations/dropbox';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';

/**
 * One-shot "New Shoot" — the fast manual path for shoots not booked through
 * the website. Creates (or reuses) the client, the listing, and the order,
 * assigns the photographer, and — when a contractor is assigned — provisions
 * the Dropbox upload link up front, all in a single request. The office lands
 * on the order page with the link ready and a one-tap "send to photographer".
 *
 * Collapses the old 4-screen chain (client → listing → order → assign+link)
 * into one submit. The link/email are still explicit: we create the link but
 * never auto-email — sending stays a deliberate click on the order page.
 */
const Body = z.object({
  // Client: attach to an existing one, or create inline via new_client.
  client_id: z.string().uuid().optional(),
  new_client: z
    .object({
      full_name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().default(''),
      brokerage: z.string().optional().default(''),
    })
    .optional(),

  // Property → becomes the listing.
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

  // Assignment — a contractor (external) or a team member (internal), or none.
  assignee: z
    .object({ type: z.enum(['contractor', 'team']), id: z.string().uuid() })
    .nullable()
    .optional(),

  // Schedule (optional — a shoot can be arranged before a time is locked).
  scheduled_at: z.string().datetime().nullable().optional(),
  duration_minutes: z.number().int().min(15).max(600).optional(),
  timezone: z.string().optional().default('America/New_York'),

  package_name: z.string().optional().default(''),
  instructions: z.string().optional().default(''), // what to capture → internal_notes

  // Products on this shoot → priced order_items + order total (what the
  // download paywall charges). Priced sqft-tiered, same as the public booking.
  items: z
    .array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).default(1) }))
    .optional()
    .default([]),

  // Auto-provision the Dropbox upload link when a contractor is assigned.
  create_intake_link: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;

  // Team gate — this route writes via the admin client, so verify staff here.
  const { data: teamRow } = await admin
    .from('team_members')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!teamRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const b = parsed.data;

  // 1) Resolve the client — reuse an existing one by email (never overwrite),
  //    otherwise insert. Mirrors /api/listings so behaviour stays consistent.
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
    const { data: existing } = await admin
      .from('clients')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      clientId = existing.id;
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
      clientId = client.id;
    }
  }

  // 2) Create the listing.
  const { data: listing, error: lErr } = await admin
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
  if (lErr || !listing) {
    return NextResponse.json({ error: lErr?.message ?? 'listing_create_failed' }, { status: 500 });
  }

  // 3) Create the order + assignment. A contractor gets contractor_id + a
  //    snapshot of their flat rate; internal staff gets photographer_id (and
  //    the DB double-book guard applies to them).
  const isContractor = b.assignee?.type === 'contractor';
  const isTeam = b.assignee?.type === 'team';

  const orderInsert: Record<string, unknown> = {
    listing_id: listing.id,
    client_id: clientId,
    status: b.scheduled_at ? 'scheduled' : 'booked',
    scheduled_at: b.scheduled_at ?? null,
    duration_minutes: b.duration_minutes ?? 60,
    timezone: b.timezone,
    package_name: b.package_name || null,
    internal_notes: b.instructions || null,
  };
  if (isContractor) orderInsert.contractor_id = b.assignee!.id;
  if (isTeam) orderInsert.photographer_id = b.assignee!.id;

  // Snapshot the contractor's rate onto the order (payout math stays stable
  // even if the rate changes later).
  if (isContractor) {
    const { data: c } = await admin
      .from('contractors')
      .select('pay_rate_cents')
      .eq('id', b.assignee!.id)
      .maybeSingle();
    orderInsert.pay_amount_cents = c?.pay_rate_cents ?? 0;
  }

  const { data: order, error: oErr } = await admin
    .from('orders')
    .insert(orderInsert)
    .select('id, order_number')
    .single();
  if (oErr || !order) {
    // Double-book guard raises SQLSTATE 23P01 (slot_unavailable) for a team
    // photographer whose time overlaps another shoot.
    const conflict = oErr?.code === '23P01' || /slot_unavailable/i.test(oErr?.message ?? '');
    return NextResponse.json(
      {
        error: conflict ? 'slot_unavailable' : oErr?.message ?? 'order_create_failed',
        message: conflict
          ? 'That photographer is already booked around this time — pick another slot or photographer.'
          : undefined,
      },
      { status: conflict ? 409 : 500 }
    );
  }

  // 3b) Itemize the order with priced products so it carries a total (the
  //     amount the download paywall charges). Best-effort: a pricing hiccup
  //     shouldn't lose the shoot — surface a warning and let the office fix it.
  let pricingWarning: string | null = null;
  if (b.items.length > 0) {
    const { error: pErr } = await admin.rpc('add_order_items_priced', {
      p_order_id: order.id,
      p_items: b.items,
      p_sqft: b.sqft ?? 0,
    });
    if (pErr) pricingWarning = pErr.message ?? 'pricing_failed';
  }

  // 4) When a contractor is assigned, provision the Dropbox upload link now so
  //    it's ready to send. Best-effort: a link failure must NOT lose the shoot
  //    that was just created — surface a warning and let them retry on the page.
  let intakeUrl: string | null = null;
  let intakeWarning: string | null = null;
  if (isContractor && b.create_intake_link) {
    const slug = [b.address_line1, b.city].filter(Boolean).join(' ') || `order-${order.order_number}`;
    const result = await createPhotoIntakeRequest(
      order.order_number,
      slug,
      `RAW photos — ${b.address_line1} (Oceano Blue)`
    );
    if (result.status === 'created') {
      intakeUrl = result.url;
      await admin
        .from('orders')
        .update({ dropbox_intake_url: result.url, dropbox_intake_path: result.path })
        .eq('id', order.id);
    } else if (result.status === 'not_configured') {
      intakeWarning = 'dropbox_not_configured';
    } else {
      intakeWarning = result.error || 'dropbox_link_failed';
    }
  }

  // Sync onto the office calendars (master + assignee). Fail-soft.
  try {
    await syncShootCalendar(order.id);
  } catch (e) {
    console.error('[shoots] calendar sync failed:', e);
  }

  return NextResponse.json({
    order_id: order.id,
    order_number: order.order_number,
    intake_url: intakeUrl,
    intake_warning: intakeWarning,
    pricing_warning: pricingWarning,
  });
}
