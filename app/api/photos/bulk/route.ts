import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Bulk actions for the Review grid's multi-select.
 *
 * - remove:  archive (is_selected = false). Hidden from the gallery and never
 *            delivered, but restorable from the Archived view.
 * - restore: back to undecided (is_selected = null).
 * - delete:  permanently delete the photo rows and their stored files.
 *
 * Only finished photos (processed / delivered) on the given order are touched,
 * so a stray id can never reach RAW originals or another client's gallery.
 */
const Body = z.object({
  order_id: z.string().uuid(),
  photo_ids: z.array(z.string().uuid()).min(1).max(1000),
  action: z.enum(['remove', 'restore', 'delete']),
});

const FINAL_KINDS = ['processed', 'delivered'] as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: isStaff } = await supabase.rpc('is_team_member');
  if (!isStaff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error?.issues },
      { status: 400 }
    );
  }
  const { order_id, photo_ids, action } = parsed.data;
  const admin = createAdminClient();

  const { data: photos, error: loadErr } = await admin
    .from('photos')
    .select('id, filename, bucket, storage_path')
    .eq('order_id', order_id)
    .in('kind', FINAL_KINDS)
    .in('id', photo_ids);
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  const targets = photos ?? [];
  if (targets.length === 0) return NextResponse.json({ error: 'no_matching_photos' }, { status: 404 });
  const ids = targets.map((p) => p.id);

  if (action !== 'delete') {
    const { error } = await admin
      .from('photos')
      .update({ is_selected: action === 'remove' ? false : null })
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  // Newer versions (re-runs, adjustments) point back at the photo they came
  // from. Detach them first so the lineage FK doesn't block the delete.
  const { error: detachErr } = await admin
    .from('photos')
    .update({ parent_photo_id: null })
    .in('parent_photo_id', ids);
  if (detachErr) return NextResponse.json({ error: detachErr.message }, { status: 500 });

  // Rows first: a leftover file is harmless, a row pointing at a missing file
  // is a broken tile in the gallery.
  const { error: delErr } = await admin.from('photos').delete().in('id', ids);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const byBucket = new Map<string, string[]>();
  for (const p of targets) {
    if (!p.bucket || !p.storage_path) continue;
    byBucket.set(p.bucket, [...(byBucket.get(p.bucket) ?? []), p.storage_path]);
  }
  const storageErrors: string[] = [];
  for (const [bucket, paths] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) storageErrors.push(`${bucket}: ${error.message}`);
  }

  await admin.from('activity_log').insert({
    order_id,
    actor_type: 'user',
    actor_id: user.id,
    action: 'photos_deleted',
    details: { count: ids.length, filenames: targets.map((p) => p.filename), storage_errors: storageErrors },
  });

  return NextResponse.json({ ok: true, deleted: ids.length, storage_errors: storageErrors });
}
