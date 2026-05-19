import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Registers a photo that was uploaded directly from the browser to Supabase
 * Storage. The browser uploads big files itself (bypassing Vercel's 4.5 MB
 * function body limit), then calls this endpoint with the metadata so we can
 * insert a row into `photos` and advance the order.
 */
const Body = z.object({
  order_id: z.string().uuid(),
  photos: z.array(
    z.object({
      photo_id: z.string().uuid(),
      filename: z.string(),
      storage_path: z.string(),
      mime_type: z.string().optional().default('application/octet-stream'),
      byte_size: z.number().int().nonnegative(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
  ),
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
  const { order_id, photos } = parsed.data;
  if (photos.length === 0) {
    return NextResponse.json({ error: 'no_photos' }, { status: 400 });
  }

  const rows = photos.map((p) => ({
    id: p.photo_id,
    order_id,
    kind: 'raw' as const,
    storage_path: p.storage_path,
    bucket: 'raw-photos',
    filename: p.filename,
    mime_type: p.mime_type,
    width: p.width ?? null,
    height: p.height ?? null,
    byte_size: p.byte_size,
    exif: {},
    uploaded_by: user.id,
    processing_status: 'pending' as const,
  }));

  const { error: insErr } = await supabase.from('photos').insert(rows);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Bump order status when we get the first upload
  await supabase
    .from('orders')
    .update({ status: 'uploaded' })
    .eq('id', order_id)
    .in('status', ['scheduled', 'shooting', 'booked']);

  return NextResponse.json({ registered: rows.length });
}
