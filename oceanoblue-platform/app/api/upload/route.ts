import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';

/**
 * Accepts multipart photo uploads from the dashboard.
 *
 * Each file is:
 *  - re-encoded to JPEG for thumbnails/previews (originals are kept too if RAW)
 *  - stored in `raw-photos/<order_id>/<photo_id>-<filename>`
 *  - inserted into the `photos` table with EXIF parsed
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await request.formData();
  const orderId = form.get('order_id');
  if (typeof orderId !== 'string') {
    return NextResponse.json({ error: 'order_id required' }, { status: 400 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'no files' }, { status: 400 });
  }

  const inserted: Array<{ id: string; filename: string }> = [];

  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const photoId = uuidv4();
    const storagePath = `${orderId}/${photoId}-${file.name}`;

    // Upload original
    const { error: upErr } = await supabase.storage
      .from('raw-photos')
      .upload(storagePath, buf, { contentType: file.type, upsert: false });
    if (upErr) {
      return NextResponse.json({ error: upErr.message, file: file.name }, { status: 500 });
    }

    // Read EXIF + dimensions
    let exif: Record<string, unknown> = {};
    let width: number | undefined;
    let height: number | undefined;
    try {
      const meta = await sharp(buf).metadata();
      width = meta.width;
      height = meta.height;
      if (meta.exif) {
        // sharp returns raw EXIF bytes; surface a minimal subset
        exif = { _raw_size: meta.exif.byteLength };
      }
    } catch {
      // non-fatal — RAW files may not parse via sharp
    }

    const { error: insErr } = await supabase.from('photos').insert({
      id: photoId,
      order_id: orderId,
      kind: 'raw',
      storage_path: storagePath,
      bucket: 'raw-photos',
      filename: file.name,
      mime_type: file.type,
      width,
      height,
      byte_size: buf.byteLength,
      exif,
      uploaded_by: user.id,
      processing_status: 'pending',
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message, file: file.name }, { status: 500 });
    }
    inserted.push({ id: photoId, filename: file.name });
  }

  // Bump order to 'uploaded' if still earlier in the pipeline
  await supabase
    .from('orders')
    .update({ status: 'uploaded' })
    .eq('id', orderId as string)
    .in('status', ['scheduled', 'shooting', 'booked']);

  return NextResponse.json({ uploaded: inserted });
}
