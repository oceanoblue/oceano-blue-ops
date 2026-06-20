import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveRerun, withCorrection } from '@/lib/ai/rerun-resolve';
import { getProvider } from '@/lib/ai';

/**
 * POST /api/ai/rerun  { photo_id, correction? }
 *
 * Re-runs the recipe that produced a processed photo, against the SAME original
 * inputs the first edit used. Produces a NEW output (the old one is kept for
 * comparison) — non-destructive. When `correction` is supplied, it's folded into
 * the recipe's editor note so the re-render applies a targeted fix (used by the
 * QC "Fix" actions).
 */
const Body = z.object({
  photo_id: z.string().uuid(),
  correction: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { photo_id, correction } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const resolved = await resolveRerun(admin, photo_id);
  if ('error' in resolved) {
    const status = resolved.error === 'photo_not_found' ? 404 : 422;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  const recipe = correction ? withCorrection(resolved.recipe, correction) : resolved.recipe;

  // Validate the provider still has its key before enqueuing.
  const provider = getProvider((recipe.provider as any) ?? 'auto', recipe.job_type);
  if (!provider.isConfigured()) {
    return NextResponse.json(
      { error: 'not_configured', provider: provider.id, hint: `Provider ${provider.id} is missing its API key.` },
      { status: 400 }
    );
  }

  const { data: job, error: jobErr } = await admin
    .from('ai_jobs')
    .insert({
      order_id: resolved.orderId,
      job_type: recipe.job_type,
      provider: provider.id,
      input_photo_ids: resolved.inputs,
      prompt: recipe.prompt,
      status: 'pending' as const,
      created_by: user.id,
      params: {
        recipe,
        rerun_of: resolved.srcJobId ?? null,
        rerun_from_photo: photo_id,
        ...(correction ? { qc_fix: true } : {}),
      } as any,
    })
    .select('id')
    .single();
  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message || 'job_insert_failed' }, { status: 500 });
  }

  kickWorker();
  return NextResponse.json({ queued: [(job as any).id] });
}

function kickWorker() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  const secret = process.env.CRON_SECRET;
  if (base && secret) {
    const url = base.startsWith('http') ? base : `https://${base}`;
    fetch(`${url}/api/cron/run-pending-jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    }).catch(() => {});
  }
}
