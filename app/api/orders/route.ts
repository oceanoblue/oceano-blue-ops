import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Internal "New order" from a listing — the listing-first workflow.
 * Creates a draft photo order on the listing (client inherited from the
 * listing); the team schedules/uploads from the order workspace.
 */
const Body = z.object({
  listing_id: z.string().uuid(),
  scheduled_at: z.string().datetime().nullable().optional(),
  duration_minutes: z.number().int().min(15).max(600).optional(),
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

  const admin = createAdminClient() as any;
  const { data: listing } = await admin
    .from('listings')
    .select('id, client_id')
    .eq('id', parsed.data.listing_id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: 'listing_not_found' }, { status: 404 });

  const { data: order, error } = await admin
    .from('orders')
    .insert({
      listing_id: listing.id,
      client_id: listing.client_id,
      status: 'draft',
      scheduled_at: parsed.data.scheduled_at ?? null,
      duration_minutes: parsed.data.duration_minutes ?? 60,
    })
    .select('id')
    .single();
  if (error || !order) {
    return NextResponse.json({ error: error?.message ?? 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ order_id: order.id });
}
