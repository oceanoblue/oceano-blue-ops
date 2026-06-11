import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { classifyScene } from '@/lib/photos/scene-classify';

export const dynamic = 'force-dynamic';
// Timeout set in vercel.json (`functions`) — `export const maxDuration` makes
// the handler receive an empty cookie store here, breaking getUser() auth.

/**
 * Real Estate Photo Rescue v2 — AI scene classification (foundation).
 *
 * Runs the vision classifier over stored THUMBNAILS (never the local originals)
 * for assets that still have an unknown scene. Degrades gracefully: if
 * OPENAI_API_KEY is not set it returns { skipped: true } and the workflow keeps
 * working with heuristic + manual classification. Bounded per call to keep cost
 * and latency predictable.
 */
const Body = z.object({ job_id: z.string().uuid(), limit: z.number().int().min(1).max(60).optional() });

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_openai_key', classified: 0 });
  }

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { job_id } = parsed.data;
  const limit = parsed.data.limit ?? 40;
  const admin = createAdminClient() as any;

  const { data: assets } = await admin
    .from('assets')
    .select('id, thumbnail_url, metadata, status')
    .eq('job_id', job_id);

  // Only classify assets that have a thumbnail and aren't already labelled.
  const candidates = (assets ?? [])
    .filter((a: any) => a.thumbnail_url && a.status !== 'rejected')
    .filter((a: any) => !a.metadata?.scene || a.metadata.scene === 'unknown')
    .slice(0, limit);

  let classified = 0;
  for (const a of candidates) {
    const { data: blob, error: dlErr } = await admin.storage.from('thumbnails').download(a.thumbnail_url);
    if (dlErr || !blob) continue;
    const buffer = Buffer.from(await blob.arrayBuffer());
    const result = await classifyScene(buffer);
    if (!result) continue;
    const metadata = { ...(a.metadata ?? {}), scene: result.scene, scene_source: 'ai', scene_confidence: result.confidence };
    await admin.from('assets').update({ metadata }).eq('id', a.id);
    classified++;
  }

  if (classified > 0) {
    await admin.from('production_events').insert({
      job_id,
      actor_type: 'agent',
      actor_id: user.id,
      event_type: 'scenes_classified',
      summary: `AI classified ${classified} photo scene(s)`,
      details: { classified },
    });
  }

  return NextResponse.json({ ok: true, classified, candidates: candidates.length });
}
