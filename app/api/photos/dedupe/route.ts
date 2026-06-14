import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fingerprint } from '@/lib/photos/fingerprint';
import { clusterDuplicates, type Fingerprinted } from '@/lib/photos/dedupe';
import { isDeliverable } from '@/lib/photos/deliverable';
import { mapWithConcurrency } from '@/lib/utils/concurrent';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Find near-duplicate frames among an order's deliverable photos and auto-pick
 * the sharpest in each cluster. Fingerprints every photo (perceptual hash +
 * focus score), clusters near-identical frames, and — unless dry_run — sets
 * is_selected=false on the lower-quality copies so only the keeper delivers.
 *
 * The photographer can override any decision with the existing Approve / reject
 * controls on the Review grid (the rejected copies render dimmed, not deleted).
 */
const Body = z.object({
  order_id: z.string().uuid(),
  // 0..64 bits of dHash distance to treat as "the same shot" (default 10).
  threshold: z.number().int().min(0).max(64).optional(),
  // Preview clusters without changing selection.
  dry_run: z.boolean().optional(),
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
  const { order_id, threshold, dry_run } = parsed.data;

  const admin = createAdminClient();
  const { data: photos, error } = await admin
    .from('photos')
    .select('id, filename, bucket, storage_path, kind, is_hdr, ai_provider, is_selected')
    .eq('order_id', order_id)
    .in('kind', ['processed', 'delivered'])
    .order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = ((photos ?? []) as any[]).filter(isDeliverable);

  // Fingerprint every deliverable photo with bounded parallelism (was fully
  // sequential download+decode). Unreadable frames yield null and are skipped.
  const nameById = new Map<string, string>();
  for (const p of candidates) nameById.set(p.id, p.filename);
  const fpResults = await mapWithConcurrency(candidates, 4, async (p) => {
    try {
      const { data: blob } = await admin.storage.from(p.bucket).download(p.storage_path);
      if (!blob) return null;
      const bytes = Buffer.from(await blob.arrayBuffer());
      const fp = await fingerprint(bytes);
      return { id: p.id, hash: fp.hash, sharpness: fp.sharpness } as Fingerprinted;
    } catch {
      return null;
    }
  });
  const prints: Fingerprinted[] = fpResults.filter((x): x is Fingerprinted => x !== null);

  const clusters = clusterDuplicates(prints, threshold);
  const rejectedIds = clusters.flatMap((c) => c.rejectedIds);

  if (!dry_run && rejectedIds.length > 0) {
    const { error: upErr } = await admin
      .from('photos')
      .update({ is_selected: false })
      .in('id', rejectedIds);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    dry_run: dry_run ?? false,
    scanned: prints.length,
    duplicate_sets: clusters.length,
    deselected: dry_run ? 0 : rejectedIds.length,
    clusters: clusters.map((c) => ({
      keep: { id: c.bestId, filename: nameById.get(c.bestId) ?? null },
      drop: c.rejectedIds.map((id) => ({ id, filename: nameById.get(id) ?? null })),
    })),
  });
}
