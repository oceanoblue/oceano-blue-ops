import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { fieldShootLoggedEmail } from '@/lib/email/templates';

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

  // Tell the office a photographer just logged a shoot (self-logging doesn't go
  // through the office, so nothing else would surface it). Email + SMS to admins,
  // fail-soft — never fails the log itself.
  try {
    await notifyAdminsOfLoggedShoot(orderId as string, user.id, b, request);
  } catch (e) {
    console.error('[field/shoots] admin notify failed:', e);
  }

  return NextResponse.json({ order_id: orderId });
}

async function notifyAdminsOfLoggedShoot(
  orderId: string,
  userId: string,
  b: z.infer<typeof Body>,
  request: Request
) {
  const admin = createAdminClient() as any;

  const [{ data: me }, { data: admins }] = await Promise.all([
    admin.from('contractors').select('full_name').eq('auth_user_id', userId).maybeSingle(),
    admin.from('team_members').select('email, phone').eq('role', 'admin').eq('is_active', true),
  ]);

  const adminRows = (admins ?? []) as Array<{ email: string | null; phone: string | null }>;
  const emailTo = adminRows.map((a) => a.email).filter((e): e is string => Boolean(e));
  const smsTo = adminRows.map((a) => a.phone).filter((p): p is string => Boolean(p));
  if (emailTo.length === 0 && smsTo.length === 0) return;

  const who = me?.full_name ?? 'A photographer';
  const cityStateZip = [b.city, b.state, b.zip].filter(Boolean).join(', ') || null;
  const services = b.services.length ? b.services.join(', ') : null;
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const orderUrl = `${base}/dashboard/orders/${orderId}`;

  const { subject, html } = fieldShootLoggedEmail({
    contractorName: who,
    address: b.address_line1,
    cityStateZip,
    sqft: b.sqft ?? null,
    services,
    orderUrl,
  });
  const smsText = `Oceano Blue: ${who} logged a new shoot — ${b.address_line1}${cityStateZip ? ', ' + cityStateZip : ''}`;

  await Promise.all([
    ...emailTo.map((to) => sendEmail({ to, subject, html })),
    ...smsTo.map((to) => sendSms({ to, text: smsText })),
  ]);
}
