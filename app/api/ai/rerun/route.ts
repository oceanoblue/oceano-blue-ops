import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recipeFromParams, type EnhanceRecipe } from '@/lib/ai/recipe';
import { buildPrompt } from '@/lib/ai/prompts';
import { getProvider } from '@/lib/ai';
import type { AiJobType } from '@/lib/supabase/database.types';

/**
 * POST /api/ai/rerun  { photo_id }
 *
 * Re-runs the exact recipe that produced a processed photo, against the SAME
 * original inputs that the first edit used. Produces a NEW output (the old one
 * is left intact for comparison) — non-destructive, like every other edit.
 *
 * Resolution order for the recipe + inputs:
 *   1. photo.source_job_id -> the producing ai_jobs row (inputs + params.recipe)
 *   2. photo.ai_recipe (denormalized copy) as a fallback recipe
 *   3. photo.parent_photo_id as a fallback input when there's no job lineage
 */
const Body = z.object({ photo_id: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { photo_id } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: photo } = await admin
    .from('photos')
    .select('id, order_id, parent_photo_id, source_job_id, ai_recipe')
    .eq('id', photo_id)
    .maybeSingle();
  if (!photo) return NextResponse.json({ error: 'photo_not_found' }, { status: 404 });

  let recipe: EnhanceRecipe | null = ((photo as any).ai_recipe as EnhanceRecipe) ?? null;
  let inputs: string[] | null = null;

  const srcJobId = (photo as any).source_job_id as string | null;
  if (srcJobId) {
    const { data: job } = await admin
      .from('ai_jobs')
      .select('input_photo_ids, params, job_type, provider, prompt')
      .eq('id', srcJobId)
      .maybeSingle();
    if (job) {
      inputs = ((job as any).input_photo_ids as string[]) ?? null;
      recipe =
        recipe ??
        recipeFromParams((job as any).params) ?? {
          job_type: (job as any).job_type as AiJobType,
          provider: (job as any).provider as string,
          directives: null,
          prompt_extra: null,
          prompt: ((job as any).prompt as string) ?? buildPrompt((job as any).job_type as AiJobType),
        };
    }
  }

  // No job lineage (older photo) — re-enhance from the original parent frame.
  if (!inputs || inputs.length === 0) {
    const parent = (photo as any).parent_photo_id as string | null;
    inputs = parent ? [parent] : null;
  }
  if (!recipe) {
    return NextResponse.json(
      { error: 'no_recipe', hint: 'This photo has no stored recipe to re-run.' },
      { status: 422 }
    );
  }
  if (!inputs || inputs.length === 0) {
    return NextResponse.json(
      { error: 'no_inputs', hint: 'Could not resolve the original source frame(s) to re-run from.' },
      { status: 422 }
    );
  }

  // Validate the provider still has its key before enqueuing.
  const resolved = getProvider((recipe.provider as any) ?? 'auto', recipe.job_type);
  if (!resolved.isConfigured()) {
    return NextResponse.json(
      { error: 'not_configured', provider: resolved.id, hint: `Provider ${resolved.id} is missing its API key.` },
      { status: 400 }
    );
  }

  const { data: job, error: jobErr } = await admin
    .from('ai_jobs')
    .insert({
      order_id: (photo as any).order_id,
      job_type: recipe.job_type,
      provider: resolved.id,
      input_photo_ids: inputs,
      prompt: recipe.prompt,
      status: 'pending' as const,
      created_by: user.id,
      params: { recipe, rerun_of: srcJobId ?? null, rerun_from_photo: photo_id } as any,
    })
    .select('id')
    .single();
  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message || 'job_insert_failed' }, { status: 500 });
  }

  // Kick the background worker (same pattern as /api/ai/process).
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  const secret = process.env.CRON_SECRET;
  if (base && secret) {
    const url = base.startsWith('http') ? base : `https://${base}`;
    fetch(`${url}/api/cron/run-pending-jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    }).catch(() => {});
  }

  return NextResponse.json({ queued: [(job as any).id] });
}
