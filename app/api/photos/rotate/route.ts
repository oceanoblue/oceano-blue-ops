import { NextResponse } from 'next/server';
import { z } from 'zod';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Rotate a photo by 90, 180, or 270 degrees. We persist the rotated copy as
 * a new processed photo (rather than mutating the original) so the original
 * stays available for re-runs.
 */
const Body = z.object({
  photo_id: z.string().uuid(),
  degrees: z.union([z.literal(90), z.literal(180), z.literal(270), z.literal(-90)]),
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
  const { photo_id, degrees } = parsed.data;

  const admin = createAdminClient();
  const { data: src } = await admin
    .from('photos')
    .select('*')
    .eq('id', photo_id)
    .maybeSingle();
  if (!src) return NextResponse.json({ error: 'photo_not_found' }, { status: 404 });

  const { data: file, error: dlErr } = await admin.storage
    .from(src.bucket)
    .download(src.storage_path);
  if (dlErr || !file) {
    return NextResponse.json({ error: dlErr?.message || 'download_failed' }, { status: 500 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const rotated = await sharp(buf)
    .rotate(degrees, { background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(rotated).metadata();

  const newId = uuidv4();
  const newPath = `${src.order_id}/${newId}-rot${degrees}-${src.filename}`;
  const { error: upErr } = await admin.storage
    .from('processed-photos')
    .upload(newPath, rotated, { contentType: 'image/jpeg', upsert: false });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { error: insErr } = await admin.from('photos').insert({
    id: newId,
    order_id: src.order_id,
    kind: 'processed',
    parent_photo_id: src.id,
    storage_path: newPath,
    bucket: 'processed-photos',
    filename: `rotated-${src.filename}`,
    mime_type: 'image/jpeg',
    width: meta.width,
    height: meta.height,
    byte_size: rotated.byteLength,
    processing_status: 'complete',
    ai_provider: 'oceano-enhance',
    ai_prompt: `rotate ${degrees}°`,
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ photo_id: newId, width: meta.width, height: meta.height });
}
