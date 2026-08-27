import { createAdminClient } from '@/lib/supabase/server';
import { deleteEvent } from '@/lib/google-calendar/api';

export interface DeleteOrderResult {
  order_id: string;
  dry_run: boolean;
  /** Storage objects removed (or that would be removed in a dry run). */
  files: number;
  /** Total bytes of those objects. */
  bytes: number;
  /** Per-bucket counts for display. */
  by_bucket: Record<string, number>;
  /** Whether the order row itself was deleted (cascades to all child rows). */
  order_deleted: boolean;
  /** Whether the shoot's Google Calendar event was removed. */
  calendar_event_removed: boolean;
  errors: string[];
}

/**
 * Permanently delete an ENTIRE order: every storage object it owns (originals,
 * converted JPEGs, processed/enhanced outputs) across all buckets, then the
 * order row itself — whose `on delete cascade` FKs remove photos, ai_jobs,
 * order_services, order_items, delivery_links and activity_log rows.
 *
 * This is for junk: duplicate uploads, empty/test orders. Unlike
 * `cleanupOrderRaws` (which keeps the order and only trims RAW originals), this
 * removes the order outright. Deleting storage.objects rows alone would orphan
 * the underlying S3 bytes, so we always go through the storage `remove` API.
 *
 * Pass dryRun=true to preview counts/sizes without deleting anything.
 */
export async function deleteOrderCompletely(
  orderId: string,
  options: { dryRun?: boolean } = {}
): Promise<DeleteOrderResult> {
  const admin = createAdminClient();
  const dryRun = !!options.dryRun;
  const result: DeleteOrderResult = {
    order_id: orderId,
    dry_run: dryRun,
    files: 0,
    bytes: 0,
    by_bucket: {},
    order_deleted: false,
    calendar_event_removed: false,
    errors: [],
  };

  // The shoot's calendar event lives on the assigned photographer's calendar —
  // capture it before we delete the row so we can un-book them afterward.
  const { data: ord } = await admin
    .from('orders')
    .select('photographer_id, gcal_event_id')
    .eq('id', orderId)
    .maybeSingle();

  // Every photo row across all kinds carries its bucket + storage_path.
  const { data: photos, error } = await admin
    .from('photos')
    .select('id, bucket, storage_path, byte_size')
    .eq('order_id', orderId);
  if (error) throw new Error(`load_photos_failed: ${error.message}`);

  const byBucket = new Map<string, string[]>();
  for (const p of (photos ?? []) as any[]) {
    if (!p.storage_path || !p.bucket) continue;
    const arr = byBucket.get(p.bucket) ?? [];
    arr.push(p.storage_path);
    byBucket.set(p.bucket, arr);
    result.files += 1;
    result.bytes += Number(p.byte_size) || 0;
    result.by_bucket[p.bucket] = (result.by_bucket[p.bucket] ?? 0) + 1;
  }

  if (dryRun) return result;

  // 1) Remove the storage objects bucket-by-bucket (batched to stay well under
  //    any per-request limit).
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error: stErr } = await admin.storage.from(bucket).remove(batch);
      if (stErr) result.errors.push(`${bucket}: ${stErr.message}`);
    }
  }

  // 2) Delete the order row — cascades to photos/ai_jobs/order_services/
  //    order_items/delivery_links/activity_log via their FKs.
  const { error: delErr } = await admin.from('orders').delete().eq('id', orderId);
  if (delErr) {
    result.errors.push(`order_delete_failed: ${delErr.message}`);
    return result;
  }
  result.order_deleted = true;

  // 3) Un-book the photographer's Google Calendar (best-effort — never fail the
  //    delete over a calendar hiccup).
  const photographerId = (ord as any)?.photographer_id as string | null | undefined;
  const eventId = (ord as any)?.gcal_event_id as string | null | undefined;
  if (photographerId && eventId) {
    try {
      await deleteEvent(photographerId, eventId);
      result.calendar_event_removed = true;
    } catch (e) {
      result.errors.push(`calendar_event: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
