import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { generateDeliveryToken } from '@/lib/utils/delivery-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Admin-only: spins up (or resets) a self-contained DEMO — a Lowcountry listing
 * with a priced, delivered order and a shareable gallery link — so the team can
 * experience the realtor + buyer flow (including the pay-to-download paywall)
 * end to end. Runs server-side with the service role, so it can upload the demo
 * photos into private Storage. Idempotent: re-running resets the demo.
 *
 * POST body: { photo_urls?: string[], reset?: boolean }
 */
const Body = z.object({
  photo_urls: z.array(z.string().url()).optional().default([]),
  reset: z.boolean().optional().default(true),
});

const DEMO_EMAIL = 'demo-agent@oceanoblue.net';

export async function POST(request: Request) {
  // Gate: a logged-in, active team ADMIN only.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data: me } = await admin
    .from('team_members')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!me || !me.is_active || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { photo_urls, reset } = parsed.data;

  // Make sure the delivery bucket exists (matches the real finals pipeline).
  try {
    await admin.storage.createBucket('processed-photos', { public: false });
  } catch {
    /* already exists */
  }

  // 1) Reset any prior demo so re-runs stay clean.
  if (reset) {
    const { data: existing } = await admin.from('clients').select('id').eq('email', DEMO_EMAIL).maybeSingle();
    if (existing) {
      const { data: oids } = await admin.from('orders').select('id').eq('client_id', existing.id);
      const orderIds = (oids ?? []).map((o: any) => o.id);
      if (orderIds.length) {
        const { data: phs } = await admin.from('photos').select('bucket, storage_path').in('order_id', orderIds);
        const byBucket: Record<string, string[]> = {};
        for (const p of phs ?? []) (byBucket[p.bucket] ??= []).push(p.storage_path);
        for (const [b, paths] of Object.entries(byBucket)) await admin.storage.from(b).remove(paths).catch(() => {});
        await admin.from('delivery_links').delete().in('order_id', orderIds);
        await admin.from('order_items').delete().in('order_id', orderIds);
        await admin.from('photos').delete().in('order_id', orderIds);
        await admin.from('orders').delete().in('id', orderIds);
      }
      await admin.from('listings').delete().eq('client_id', existing.id);
      await admin.from('clients').delete().eq('id', existing.id);
    }
  }

  // 2) Demo client (a Lowcountry agent).
  const { data: client, error: cErr } = await admin
    .from('clients')
    .insert({
      full_name: 'Demo Agent — Palmetto Bluff',
      email: DEMO_EMAIL,
      phone: '(843) 555-0142',
      brokerage: 'Lowcountry Signature Realty',
      is_archived: false,
    })
    .select('id')
    .single();
  if (cErr || !client) return NextResponse.json({ error: cErr?.message ?? 'client_failed' }, { status: 500 });

  // 3) Demo listing.
  const sqft = 3200;
  const { data: listing, error: lErr } = await admin
    .from('listings')
    .insert({
      client_id: client.id,
      address_line1: '12 Water Oak Lane',
      city: 'Bluffton',
      state: 'SC',
      zip: '29910',
      property_type: 'Single family',
      bedrooms: 4,
      bathrooms: 4,
      sqft,
      list_price: 1895000,
      status: 'active',
    })
    .select('id')
    .single();
  if (lErr || !listing) return NextResponse.json({ error: lErr?.message ?? 'listing_failed' }, { status: 500 });

  // 4) Delivered order.
  const { data: order, error: oErr } = await admin
    .from('orders')
    .insert({
      listing_id: listing.id,
      client_id: client.id,
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      duration_minutes: 90,
      timezone: 'America/New_York',
      package_name: 'Lowcountry Signature',
      source: 'demo',
    })
    .select('id, order_number')
    .single();
  if (oErr || !order) return NextResponse.json({ error: oErr?.message ?? 'order_failed' }, { status: 500 });

  // 5) Price it (photography + cinematic video) so the paywall engages.
  const { data: prods } = await admin
    .from('products')
    .select('id, slug')
    .in('slug', ['interior_exterior_photo', 'cinematic_video']);
  const items = (prods ?? []).map((p: any) => ({ product_id: p.id, quantity: 1 }));
  if (items.length) {
    await admin.rpc('add_order_items_priced', { p_order_id: order.id, p_items: items, p_sqft: sqft });
  }

  // 6) Upload the demo photos into private Storage + register them as finals.
  const rooms = ['exterior', 'living_room', 'kitchen', 'primary_bedroom', 'aerial', 'dining_room', 'office', 'exterior'];
  const rows: any[] = [];
  let i = 0;
  for (const url of photo_urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      const path = `demo/${order.id}/${String(i + 1).padStart(2, '0')}.png`;
      const { error: upErr } = await admin.storage
        .from('processed-photos')
        .upload(path, buf, { contentType: 'image/png', upsert: true });
      if (upErr) continue;
      rows.push({
        order_id: order.id,
        kind: 'processed',
        bucket: 'processed-photos',
        storage_path: path,
        filename: `lowcountry-${i + 1}.png`,
        mime_type: 'image/png',
        processing_status: 'complete',
        is_selected: true,
        is_hdr: false,
        sort_order: i,
        room_type: rooms[i % rooms.length],
        ai_provider: 'demo',
        uploaded_by: user.id,
      });
      i++;
    } catch {
      /* skip a bad url */
    }
  }
  if (rows.length) await admin.from('photos').insert(rows);

  // 7) Shareable delivery link.
  const token = generateDeliveryToken();
  await admin.from('delivery_links').insert({ order_id: order.id, token, created_by: user.id });

  const base = new URL(request.url).origin;
  return NextResponse.json({
    ok: true,
    order_id: order.id,
    order_number: order.order_number,
    photos_uploaded: rows.length,
    gallery_url: `${base}/gallery/${token}`,
  });
}
