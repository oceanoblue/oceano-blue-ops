import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isDeliverable } from '@/lib/photos/deliverable';
import { computeColorStats } from '@/lib/ai/qc/color-stats';
import { analyzeConsistency, type PhotoStat } from '@/lib/ai/qc/consistency';
import { wallCheck } from '@/lib/ai/qc/wall-check';
import { computeClipping } from '@/lib/ai/qc/clipping';
import { computeStructureDrift } from '@/lib/ai/qc/structure';
import { rulesetFor, evaluateVerdict } from '@/lib/ai/qc/rulesets';
import { profileFor } from '@/lib/photos/profiles';
import { mapWithConcurrency } from '@/lib/utils/concurrent';

/**
 * POST /api/ai/qc-review { order_id }
 *
 * Reviews the finished photo set for an order:
 *   1. Deterministic white-balance/exposure consistency across the set (Sharp).
 *   2. AI fidelity check per photo vs its original — wall/material color drift +
 *      white-balance neutrality + color accuracy (GPT-4o-mini, when configured).
 * Persists a photo_qc_reports row and returns the report for the UI.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({ order_id: z.string().uuid() });

// Bound the work so a huge order can't blow the function budget / cost.
const MAX_PHOTOS = 60;

const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { order_id } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: isStaff } = await supabase.rpc('is_team_member');
  if (!isStaff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient() as any;

  // Production profile selects the QC bar (thresholds + pass/fail), not the
  // checks themselves. Falls back to MLS for legacy orders with no project_type.
  const { data: orderRow } = await admin
    .from('orders')
    .select('project_type')
    .eq('id', order_id)
    .maybeSingle();
  const profile = profileFor(orderRow?.project_type);
  const ruleset = rulesetFor(orderRow?.project_type);

  // The set the client will receive: approved, finished, deliverable photos.
  const { data: all } = await admin
    .from('photos')
    .select('id, filename, bucket, storage_path, parent_photo_id, kind, is_hdr, ai_provider, is_selected, room_type')
    .eq('order_id', order_id)
    .in('kind', ['processed', 'delivered']);

  let pool = ((all ?? []) as any[]).filter((p) => isDeliverable(p) && !RAW_EXT.test(p.filename));
  const selected = pool.filter((p) => p.is_selected === true);
  if (selected.length) pool = selected; // prefer the approved set
  if (pool.length === 0) {
    return NextResponse.json(
      { error: 'no_photos', message: 'No enhanced photos to review yet.' },
      { status: 400 }
    );
  }
  const truncated = pool.length > MAX_PHOTOS;
  pool = pool.slice(0, MAX_PHOTOS);

  // Download + color stats + highlight-clipping (bounded concurrency). Cache
  // buffers for the AI pass; both metrics come from the one decode.
  const editedBuffers = new Map<string, Buffer>();
  const stats: PhotoStat[] = [];
  const blownFractionByPhoto = new Map<string, number>();
  await mapWithConcurrency(pool, 4, async (p) => {
    try {
      const { data, error } = await admin.storage.from(p.bucket).download(p.storage_path);
      if (error || !data) return;
      const buf = Buffer.from(await data.arrayBuffer());
      editedBuffers.set(p.id, buf);
      const s = await computeColorStats(buf);
      if (s) stats.push({ photo_id: p.id, filename: p.filename, stats: s });
      const cl = await computeClipping(buf);
      if (cl) blownFractionByPhoto.set(p.id, cl.blownFraction);
    } catch {
      /* skip unreadable frames */
    }
  });

  const consistency = analyzeConsistency(stats, ruleset.deltas);
  const consistencyByPhoto = new Map(consistency.findings.map((f) => [f.photo_id, f]));

  // Highlight-hold: which photos blow past the profile's tolerance (Phase D
  // signal — flags the photos that want the assisted window-pull finish).
  const maxBlown = ruleset.windowHold?.maxBlownFraction ?? Infinity;
  const blownPhotos = new Set(
    [...blownFractionByPhoto].filter(([, f]) => f > maxBlown).map(([id]) => id)
  );

  // AI fidelity check vs each photo's original (best-effort; skipped w/o key).
  const parentIds = Array.from(new Set(pool.map((p) => p.parent_photo_id).filter(Boolean)));
  const parents = new Map<string, any>();
  if (parentIds.length) {
    const { data: prows } = await admin
      .from('photos')
      .select('id, bucket, storage_path')
      .in('id', parentIds);
    for (const pr of (prows ?? []) as any[]) parents.set(pr.id, pr);
  }

  let aiRan = false;
  const aiByPhoto = new Map<string, any>();
  const structureByPhoto = new Map<string, { score: number; drifted: boolean }>();
  await mapWithConcurrency(pool, 3, async (p) => {
    const parent = p.parent_photo_id ? parents.get(p.parent_photo_id) : null;
    const edited = editedBuffers.get(p.id);
    if (!parent || !edited) return;
    try {
      const { data, error } = await admin.storage.from(parent.bucket).download(parent.storage_path);
      if (error || !data) return;
      const orig = Buffer.from(await data.arrayBuffer());
      // Structure-drift guard: generative outputs only (the deterministic
      // engine legitimately warps pixels — lens correction / keystone — and
      // would false-positive). Deterministic + free, so it always runs; the
      // GPT-4o wall check below still needs its key.
      if (p.ai_provider && p.ai_provider !== 'oceano-enhance') {
        const s = await computeStructureDrift(orig, edited);
        if (s) structureByPhoto.set(p.id, s);
      }
      const res = await wallCheck(orig, edited);
      if (res) {
        aiRan = true;
        aiByPhoto.set(p.id, res);
      }
    } catch {
      /* skip */
    }
  });

  // Merge into per-photo findings (only photos with at least one issue).
  const findings = pool
    .map((p) => {
      const c = consistencyByPhoto.get(p.id);
      const ai = aiByPhoto.get(p.id);
      const blown = blownPhotos.has(p.id);
      const structure = structureByPhoto.get(p.id);
      const issue =
        !!c ||
        blown ||
        structure?.drifted ||
        (ai && (ai.wall_drift || !ai.white_balance_ok || ai.color_accuracy === 'poor'));
      if (!issue) return null;
      return {
        photo_id: p.id,
        filename: p.filename,
        room_type: p.room_type ?? null,
        consistency: c
          ? { flags: c.flags, deltaA: c.deltaA, deltaB: c.deltaB, deltaL: c.deltaL }
          : null,
        ai: ai ?? null,
        blown_highlights: blown
          ? { fraction: Math.round((blownFractionByPhoto.get(p.id) ?? 0) * 1000) / 1000 }
          : null,
        // Generative fidelity: edge-structure correlation vs the original.
        // Low score = the model likely REDREW content, not just relit it.
        structure: structure?.drifted ? structure : null,
      };
    })
    .filter(Boolean);

  const wallDrift = Array.from(aiByPhoto.values()).filter((a) => a.wall_drift).length;
  const wbIssues = Array.from(aiByPhoto.values()).filter((a) => !a.white_balance_ok).length;
  const structureDrift = Array.from(structureByPhoto.values()).filter((s) => s.drifted).length;

  // Profile-aware pass/fail: judge the measured set against this market's bar.
  const verdict = evaluateVerdict({
    ruleset,
    report: consistency,
    flaggedCount: consistency.findings.length,
    total: pool.length,
    aiRan,
    wallDrift,
    blownCount: blownPhotos.size,
  });

  const summary = {
    photo_count: pool.length,
    evaluated: consistency.evaluated,
    truncated,
    project_type: profile.id,
    profile: profile.label,
    consistency_score: consistency.score,
    min_score: ruleset.minScore,
    median: consistency.median,
    consistency_flagged: consistency.findings.length,
    ai_ran: aiRan,
    wall_drift: wallDrift,
    wb_issues: wbIssues,
    blown_highlights: blownPhotos.size,
    structure_drift: structureDrift,
    structure_checked: structureByPhoto.size,
    // Profile verdict — the headline result for the ops UI.
    pass: verdict.pass,
    cast_flags: verdict.castFlags,
    verdict_reasons: verdict.reasons,
    fidelity_unverified: verdict.fidelityUnverified,
    // `clean` = no per-photo issues at all (kept for backward compatibility).
    clean: findings.length === 0,
  };

  const { data: report, error: insErr } = await admin
    .from('photo_qc_reports')
    .insert({ order_id, status: 'complete', summary, findings, created_by: user.id })
    .select('id, created_at')
    .single();
  if (insErr) {
    // Still return the result even if persistence failed.
    return NextResponse.json({ summary, findings, persisted: false, error: insErr.message });
  }

  return NextResponse.json({ id: report.id, created_at: report.created_at, summary, findings });
}
