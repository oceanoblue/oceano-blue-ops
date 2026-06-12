import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { classifyRoom } from '@/lib/ai/room-classify';
import { isDeliverable } from '@/lib/photos/deliverable';

export const dynamic = 'force-dynamic';
// Vision calls are sequential and ~1s each; allow headroom for a full gallery.
export const maxDuration = 300;

/**
 * Classify the deliverable photos of an order by room / area. Tags each photo
 * with photos.room_type (+ room_confidence) using the vision classifier, so the
 * Review grid and client gallery can group by room.
 *
 * Idempotent by default: only photos that don't yet have a room_type are
 * classified, so re-running picks up newly-enhanced shots without re-spending on
 * ones already tagged. Pass { reclassify: true } to redo the whole set.
 */
const Body = z.object({
  order_id: z.string().uuid(),
  reclassify: z.boolean().optional(),
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
  const { order_id, reclassify } = parsed.data;

  const admin = createAdminClient();
  const { data: photos, error } = await admin
    .from('photos')
    .select('id, bucket, storage_path, kind, is_hdr, ai_provider, room_type')
    .eq('order_id', order_id)
    .in('kind', ['processed', 'delivered'])
    .order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targets = ((photos ?? []) as any[])
    .filter(isDeliverable)
    .filter((p) => reclassify || !p.room_type);

  let classified = 0;
  let failed = 0;
  for (const p of targets) {
    try {
      const { data: blob } = await admin.storage.from(p.bucket).download(p.storage_path);
      if (!blob) {
        failed++;
        continue;
      }
      const bytes = Buffer.from(await blob.arrayBuffer());
      const result = await classifyRoom(bytes);
      if (!result) {
        failed++;
        continue;
      }
      // Cast dodges the supabase-js admin-client `.update()` never-overload
      // quirk (same as other admin writes in the baseline); room_type is now a
      // real column on Photo after 0035.
      const { error: upErr } = await (admin.from('photos') as any)
        .update({ room_type: result.roomType, room_confidence: result.confidence })
        .eq('id', p.id);
      if (upErr) failed++;
      else classified++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    classified,
    failed,
    skipped: ((photos ?? []) as any[]).filter(isDeliverable).length - targets.length,
  });
}
