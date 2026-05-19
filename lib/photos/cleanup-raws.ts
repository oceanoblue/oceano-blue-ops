import { createAdminClient } from '@/lib/supabase/server';

const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;

export interface CleanupResult {
  order_id: string;
  deleted: number;
  filenames: string[];
  errors: Array<{ filename: string; error: string }>;
  dry_run: boolean;
}

/**
 * Remove camera-RAW originals (ARW / CR2 / NEF / DNG / etc) for a single
 * order. Keeps the converted JPEG siblings + everything in the processed and
 * delivery buckets. Returns the list of files removed so the caller can show
 * the user (or log it).
 *
 * Pass dryRun=true to preview without actually deleting.
 */
export async function cleanupOrderRaws(
  orderId: string,
  options: { dryRun?: boolean } = {}
): Promise<CleanupResult> {
  const admin = createAdminClient();
  const result: CleanupResult = {
    order_id: orderId,
    deleted: 0,
    filenames: [],
    errors: [],
    dry_run: !!options.dryRun,
  };

  // Pull every raw photo on the order. We filter by extension afterward so
  // any converted JPEG siblings (which are also kind=raw) are left alone.
  const { data: photos, error } = await admin
    .from('photos')
    .select('id, filename, bucket, storage_path')
    .eq('order_id', orderId)
    .eq('kind', 'raw');
  if (error) throw new Error(`load_photos_failed: ${error.message}`);

  const targets = (photos ?? []).filter((p: any) => RAW_EXT.test(p.filename));
  if (targets.length === 0) return result;

  if (options.dryRun) {
    result.filenames = targets.map((p: any) => p.filename);
    return result;
  }

  // Group by bucket so we issue one remove() call per bucket.
  const byBucket = new Map<string, { paths: string[]; ids: string[]; names: string[] }>();
  for (const p of targets as any[]) {
    const entry = byBucket.get(p.bucket) ?? { paths: [], ids: [], names: [] };
    entry.paths.push(p.storage_path);
    entry.ids.push(p.id);
    entry.names.push(p.filename);
    byBucket.set(p.bucket, entry);
  }

  for (const [bucket, { paths, ids, names }] of byBucket) {
    const { error: stErr } = await admin.storage.from(bucket).remove(paths);
    if (stErr) {
      // Record the error per file so partial failure is visible
      for (const n of names) result.errors.push({ filename: n, error: stErr.message });
      continue;
    }
    // Remove the rows so the photos table stays in sync with storage
    const { error: dbErr } = await admin.from('photos').delete().in('id', ids);
    if (dbErr) {
      for (const n of names) result.errors.push({ filename: n, error: dbErr.message });
      continue;
    }
    result.deleted += names.length;
    result.filenames.push(...names);
  }

  // Audit trail
  if (result.deleted > 0) {
    await admin.from('activity_log').insert({
      order_id: orderId,
      actor_type: 'system',
      action: 'raw_originals_deleted',
      details: { count: result.deleted, filenames: result.filenames },
    });
  }

  return result;
}

/**
 * Sweep every delivered order whose `delivered_at` is older than the
 * configured retention window. Returns one CleanupResult per order touched.
 */
export async function cleanupExpiredRaws(): Promise<{
  retention_days: number;
  swept_orders: number;
  total_deleted: number;
  per_order: CleanupResult[];
}> {
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from('business_settings')
    .select('raw_retention_days')
    .eq('id', true)
    .maybeSingle();

  const days = Number((settings as any)?.raw_retention_days ?? 30);
  if (!Number.isFinite(days) || days <= 0) {
    return { retention_days: days, swept_orders: 0, total_deleted: 0, per_order: [] };
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders } = await admin
    .from('orders')
    .select('id, delivered_at')
    .eq('status', 'delivered')
    .lt('delivered_at', cutoff);

  const per_order: CleanupResult[] = [];
  let total = 0;
  for (const o of (orders ?? []) as any[]) {
    const r = await cleanupOrderRaws(o.id);
    if (r.deleted > 0 || r.errors.length > 0) per_order.push(r);
    total += r.deleted;
  }

  return {
    retention_days: days,
    swept_orders: per_order.length,
    total_deleted: total,
    per_order,
  };
}
