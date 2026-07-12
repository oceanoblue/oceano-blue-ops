import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { buildExportName, type ManifestEntry } from '@/lib/external-edit/manifest';

/**
 * Create an external edit batch (Fotello loop) for an order: snapshot the
 * photos to send, with sequence-named export filenames. The zip itself is
 * streamed by /api/external-edit/[id]/export.
 */
const Body = z.object({
  order_id: z.string().uuid(),
  photo_ids: z.array(z.string().uuid()).optional(),
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
  const { order_id, photo_ids } = parsed.data;

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, order_number')
    .eq('id', order_id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });

  let query = admin
    .from('photos')
    .select('id, filename, sort_order, created_at')
    .eq('order_id', order_id)
    .in('kind', ['raw', 'bracket_member'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (photo_ids?.length) query = query.in('id', photo_ids);
  const { data: photos } = await query;

  if (!photos?.length) {
    return NextResponse.json({ error: 'no_photos_to_export' }, { status: 400 });
  }

  const manifest: ManifestEntry[] = photos.map((p, i) => ({
    photo_id: p.id,
    export_name: buildExportName(order.order_number, i + 1, p.filename),
  }));

  const { data: batch, error: insErr } = await admin
    .from('external_edit_batches')
    .insert({
      order_id,
      provider: 'fotello',
      status: 'export_ready',
      manifest: manifest as any,
      photo_count: manifest.length,
      created_by: user.id,
    })
    .select('*')
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ batch });
}
