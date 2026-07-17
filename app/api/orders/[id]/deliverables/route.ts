import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Office: add a deliverable (video / 360 tour / floor plan) to an order's
 * listing — either an external URL or a file already uploaded to the
 * `deliverables` bucket by the browser. Team-only.
 */
const Body = z.object({
  kind: z.enum(['video', 'tour_360', 'floor_plan', 'other']),
  title: z.string().optional(),
  source: z.enum(['url', 'file']),
  external_url: z.string().url().optional(),
  storage_path: z.string().optional(),
  filename: z.string().optional(),
  mime_type: z.string().optional(),
  byte_size: z.number().int().nonnegative().optional(),
  is_published: z.boolean().default(true),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
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
  if (b.source === 'url' && !b.external_url) {
    return NextResponse.json({ error: 'external_url required' }, { status: 400 });
  }
  if (b.source === 'file' && !b.storage_path) {
    return NextResponse.json({ error: 'storage_path required' }, { status: 400 });
  }

  const { data: order } = await admin
    .from('orders')
    .select('id, listing_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });

  const { data, error } = await admin
    .from('listing_deliverables')
    .insert({
      listing_id: order.listing_id,
      order_id: order.id,
      kind: b.kind,
      title: b.title ?? null,
      source: b.source,
      external_url: b.source === 'url' ? b.external_url : null,
      bucket: b.source === 'file' ? 'deliverables' : null,
      storage_path: b.source === 'file' ? b.storage_path : null,
      filename: b.filename ?? null,
      mime_type: b.mime_type ?? null,
      byte_size: b.byte_size ?? null,
      is_published: b.is_published,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}
