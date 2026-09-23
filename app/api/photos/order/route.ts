import { NextResponse } from 'next/server';
import { z } from 'zod';
import exifr from 'exifr';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { orderPhotos, photoOrderMetadata, captureTime } from '@/lib/photos/order';
import { isDeliverable } from '@/lib/photos/deliverable';
import { mapWithConcurrency } from '@/lib/utils/concurrent';

export const maxDuration = 300;
const Body = z.object({ order_id: z.string().uuid(), mode: z.enum(['filename', 'captured']) });

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: team, error: teamError } = await db.rpc('is_team_member');
  if (teamError || !team) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const { order_id, mode } = parsed.data;
  const admin = createAdminClient();
  const { data: photos, error } = await admin.from('photos')
    .select('id, filename, parent_photo_id, exif, sort_order, bucket, storage_path, kind, is_hdr, ai_provider')
    .eq('order_id', order_id);
  if (error) return NextResponse.json({ error: 'Could not load photos.' }, { status: 503 });
  if (!photos?.length) return NextResponse.json({ error: 'No photos to arrange.' }, { status: 400 });
  const expected = Object.fromEntries(photos.map(p => [p.id, p.sort_order]));
  const all = new Map(photos.map(p => [p.id, p]));
  const finals = photos.filter(p => p.kind !== 'raw' && isDeliverable(p));
  if (mode === 'captured') {
    // Recover EXIF from older external finals whose metadata wasn't registered.
    // Read a bounded header even if storage ignores the Range request.
    const missing = finals.filter(p => photoOrderMetadata(p, all).captured === null);
    await mapWithConcurrency(missing, 4, async p => {
      try {
        const { data: signed } = await admin.storage.from(p.bucket).createSignedUrl(p.storage_path, 120);
        if (!signed?.signedUrl) return;
        const response = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-262143' }, signal: AbortSignal.timeout(15000) });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (size < 262144) {
            const { done, value } = await reader.read();
            if (done) break;
            const part = value.subarray(0, 262144 - size);
            chunks.push(part); size += part.length;
          }
        } finally { await reader.cancel(); }
        const tags = await exifr.parse(Buffer.concat(chunks), { pick: ['DateTimeOriginal'] });
        const date = tags?.DateTimeOriginal;
        const patch = { DateTimeOriginal: date instanceof Date ? date.toISOString() : date };
        if (captureTime(patch) === null) return;
        p.exif = { ...(p.exif as object ?? {}), ...patch };
        await admin.from('photos').update({ exif: p.exif }).eq('id', p.id).eq('order_id', order_id);
      } catch { /* Missing EXIF is reported as a filename fallback. */ }
    });
  }
  const sorted = orderPhotos(photos, mode);
  const { error: saveError } = await db.rpc('set_gallery_photo_order', {
    p_order: order_id, p_ids: sorted.map(p => p.id), p_expected: expected,
  });
  if (saveError) return NextResponse.json({ error: saveError.message.includes('gallery_changed')
    ? 'Photos changed while sorting. Refresh and apply the order again.' : 'Could not save the photo order.' }, { status: 409 });
  const missingDates = mode === 'captured' ? finals.filter(p => photoOrderMetadata(p, all).captured === null).length : 0;
  return NextResponse.json({ ok: true, count: finals.length, missing_dates: missingDates });
}
