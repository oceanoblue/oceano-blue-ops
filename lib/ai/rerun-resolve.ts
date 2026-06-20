import { recipeFromParams, type EnhanceRecipe } from './recipe';
import { buildPrompt } from './prompts';
import type { AiJobType } from '@/lib/supabase/database.types';

/**
 * Resolve the recipe + original input frames needed to re-run the edit that
 * produced a processed photo. Shared by /api/ai/rerun (single redo) and
 * /api/ai/qc-fix (batch corrected re-render).
 *
 * Resolution order:
 *   1. photo.source_job_id -> the producing ai_jobs row (inputs + params.recipe)
 *   2. photo.ai_recipe (denormalized copy) as a fallback recipe
 *   3. photo.parent_photo_id as a fallback input when there's no job lineage
 */
export interface ResolvedRerun {
  orderId: string;
  recipe: EnhanceRecipe;
  inputs: string[];
  srcJobId: string | null;
}

export async function resolveRerun(
  admin: any,
  photoId: string
): Promise<ResolvedRerun | { error: 'photo_not_found' | 'no_recipe' | 'no_inputs' }> {
  const { data: photo } = await admin
    .from('photos')
    .select('id, order_id, parent_photo_id, source_job_id, ai_recipe')
    .eq('id', photoId)
    .maybeSingle();
  if (!photo) return { error: 'photo_not_found' };

  let recipe: EnhanceRecipe | null = (photo.ai_recipe as EnhanceRecipe) ?? null;
  let inputs: string[] | null = null;
  const srcJobId = (photo.source_job_id as string | null) ?? null;

  if (srcJobId) {
    const { data: job } = await admin
      .from('ai_jobs')
      .select('input_photo_ids, params, job_type, provider, prompt')
      .eq('id', srcJobId)
      .maybeSingle();
    if (job) {
      inputs = (job.input_photo_ids as string[]) ?? null;
      recipe =
        recipe ??
        recipeFromParams(job.params) ?? {
          job_type: job.job_type as AiJobType,
          provider: job.provider as string,
          directives: null,
          prompt_extra: null,
          prompt: (job.prompt as string) ?? buildPrompt(job.job_type as AiJobType),
        };
    }
  }

  if (!inputs || inputs.length === 0) {
    const parent = (photo.parent_photo_id as string | null) ?? null;
    inputs = parent ? [parent] : null;
  }
  if (!recipe) return { error: 'no_recipe' };
  if (!inputs || inputs.length === 0) return { error: 'no_inputs' };
  return { orderId: photo.order_id as string, recipe, inputs, srcJobId };
}

/**
 * Return a copy of the recipe with an extra correction directive folded into its
 * editor note + a rebuilt prompt, so the re-render applies the fix and the
 * corrected recipe is itself reproducible.
 */
export function withCorrection(recipe: EnhanceRecipe, correction: string): EnhanceRecipe {
  const extra = [recipe.directives?.extra, correction].filter(Boolean).join(' ');
  const directives = { ...(recipe.directives ?? {}), extra };
  return {
    ...recipe,
    directives,
    prompt_extra: extra,
    prompt: buildPrompt(recipe.job_type, directives),
  };
}
