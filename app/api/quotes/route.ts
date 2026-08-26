import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { computeQuoteItems } from '@/lib/quotes/pricing';
import { computeBuilderQuote, type BuilderPackage } from '@/lib/quotes/builder-pricing';

export const dynamic = 'force-dynamic';

const BuilderAddon = z.object({ slug: z.string(), qty: z.number().int().min(1).optional() });

const Body = z.object({
  client_type: z.enum(['realtor', 'builder']).optional().default('realtor'),
  client_name: z.string().optional().default(''),
  client_email: z.string().email().optional().or(z.literal('')).default(''),
  address_line1: z.string().min(2),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zip: z.string().optional().default(''),
  sqft: z.number().int().min(0).nullable().optional(),
  listing_date: z.string().optional().nullable(),
  // realtor: à-la-carte product slugs; builder: a package + optional add-ons.
  slugs: z.array(z.string()).optional().default([]),
  pkg: z.enum(['photo', 'video', 'feature', 'signature']).optional(),
  addons: z.array(BuilderAddon).optional().default([]),
  program: z.boolean().optional().default(false),
  notes: z.string().optional().default(''),
  expires_days: z.number().int().min(1).max(90).optional().default(14),
});

// Price a quote from either track. Realtor hits the DB catalog; builder is a
// pure computation over the code-based sheet.
async function priceQuote(
  admin: ReturnType<typeof createAdminClient>,
  b: { client_type: 'realtor' | 'builder'; sqft?: number | null; slugs: string[]; pkg?: BuilderPackage; addons: { slug: string; qty?: number }[]; program: boolean }
) {
  if (b.client_type === 'builder') {
    return computeBuilderQuote({ sqft: b.sqft ?? null, pkg: (b.pkg ?? 'feature') as BuilderPackage, addons: b.addons, program: b.program });
  }
  return computeQuoteItems(admin, b.sqft ?? null, b.slugs);
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await (admin as any)
    .from('team_members')
    .select('id, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!me || !me.is_active) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;
  if (b.client_type === 'realtor' && b.slugs.length === 0) {
    return NextResponse.json({ error: 'validation_failed', message: 'Pick at least one service.' }, { status: 400 });
  }
  if (b.client_type === 'builder' && !b.pkg) {
    return NextResponse.json({ error: 'validation_failed', message: 'Pick a package.' }, { status: 400 });
  }

  const { items, subtotal_cents } = await priceQuote(admin, b);

  const token = randomBytes(9).toString('base64url'); // ~12 url-safe chars
  const expires_at = new Date(Date.now() + b.expires_days * 86400_000).toISOString();

  const { data: quote, error } = await (admin as any)
    .from('quotes')
    .insert({
      token,
      client_type: b.client_type,
      client_name: b.client_name || null,
      client_email: b.client_email || null,
      address_line1: b.address_line1,
      city: b.city || null,
      state: b.state || null,
      zip: b.zip || null,
      sqft: b.sqft ?? null,
      listing_date: b.listing_date || null,
      line_items: items,
      subtotal_cents,
      status: 'sent',
      notes: b.notes || null,
      expires_at,
      created_by: user.id,
    })
    .select('id, token')
    .single();
  if (error || !quote) {
    return NextResponse.json({ error: error?.message ?? 'create_failed' }, { status: 500 });
  }

  const base = new URL(request.url).origin;
  return NextResponse.json({
    id: quote.id,
    token: quote.token,
    url: `${base}/quote/${quote.token}`,
    subtotal_cents,
    items,
  });
}

// Live pricing preview for the builder (no insert).
export async function PUT(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));
  const client_type: 'realtor' | 'builder' = body.client_type === 'builder' ? 'builder' : 'realtor';
  const sqft: number | null = typeof body.sqft === 'number' ? body.sqft : null;

  if (client_type === 'builder') {
    if (!body.pkg) return NextResponse.json({ items: [], subtotal_cents: 0 });
    const { items, subtotal_cents } = computeBuilderQuote({
      sqft,
      pkg: body.pkg as BuilderPackage,
      addons: Array.isArray(body.addons) ? body.addons : [],
      program: !!body.program,
    });
    return NextResponse.json({ items, subtotal_cents });
  }

  const slugs: string[] = Array.isArray(body.slugs) ? body.slugs : [];
  if (!slugs.length) return NextResponse.json({ items: [], subtotal_cents: 0 });
  const { items, subtotal_cents } = await computeQuoteItems(admin, sqft, slugs);
  return NextResponse.json({ items, subtotal_cents });
}
