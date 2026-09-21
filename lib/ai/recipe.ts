import type { AiJobType } from '@/lib/supabase/database.types';
import type { AiProviderId } from './types';
import { composeEnhanceDirections, type EnhanceDirectives } from './prompts';
import { DEFAULT_FINISH, IMAGE_MODEL, FINISH_PROMPT_VERSION, finishDirections, type Finish } from './finishing';

/**
 * The reproducible "recipe" for an AI edit — everything needed to re-run it,
 * tweak it, or apply the same look to other frames.
 *
 * Persisted in two places:
 *   • ai_jobs.params.recipe   — attached when a job is enqueued
 *   • photos.ai_recipe        — denormalized onto each output so the edit stays
 *                               reproducible even if the job row is pruned
 *
 * Previously only the built `prompt` text survived (on ai_jobs.prompt /
 * photos.ai_prompt); the structured directives that produced it were lost, so
 * edits couldn't be reproduced or adjusted.
 */
export interface EnhanceRecipe {
  version?: 2;
  model?: string;
  finish?: Finish;
  prompt_version?: string;
  refinement?: boolean;
  source_photo_id?: string;
  provenance?: Record<string, unknown>;
  job_type: AiJobType;
  provider: AiProviderId | string;
  /** Structured enhance toggles, when the job used them (null for plain prompts). */
  directives: EnhanceDirectives | null;
  /** Free-form editor note that fed the prompt, if any. */
  prompt_extra: string | null;
  /** The fully-built prompt that was sent to the model. */
  prompt: string;
}

export function isEnhanceRecipe(v: unknown): v is EnhanceRecipe {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as any).job_type === 'string' &&
    typeof (v as any).prompt === 'string'
  );
}

/** Pull the recipe out of an ai_jobs.params blob, if present. */
export function recipeFromParams(params: unknown): EnhanceRecipe | null {
  if (!params || typeof params !== 'object') return null;
  const r = (params as any).recipe;
  return isEnhanceRecipe(r) ? r : null;
}

/** A short, human-readable one-liner describing a recipe (for tooltips/UI). */
export function describeRecipe(recipe: EnhanceRecipe | null | undefined): string {
  if (!recipe || !isEnhanceRecipe(recipe)) return '';
  const d = recipe.directives;
  const parts: string[] = [];
  const jobLabel: Partial<Record<AiJobType, string>> = {
    enhance_single: 'Enhance',
    hdr_merge: 'HDR merge',
    sky_replace: 'Sky',
    window_pull: 'Window pull',
    lawn_enhance: 'Lawn',
    declutter: 'Declutter',
    twilight_convert: 'Twilight',
    virtual_stage: 'Staging',
  };
  parts.push(jobLabel[recipe.job_type] ?? recipe.job_type);
  if (recipe.finish) parts.push(recipe.finish.style.replaceAll('_', ' '), `${recipe.finish.windows} windows`);
  else if (d?.enhancementStyle) parts.push(d.enhancementStyle === 'natural' ? 'Natural' : 'Signature');
  if (d?.skyStyle && d.skyStyle !== 'original') parts.push('sky');
  if (d?.windowPull) parts.push('windows');
  if (d?.perspectiveCorrection) parts.push('perspective');
  if (d?.removeReflections) parts.push('reflections');
  if (d?.blurFaces) parts.push('faces');
  return parts.join(' · ');
}

/** One recipe constructor for manual, automatic and repeat edits. */
export function createEnhanceRecipe(provider: string, directives: EnhanceDirectives = {}, finish: Finish = DEFAULT_FINISH): EnhanceRecipe {
  const extra = directives.extra?.trim();
  return {
    version: 2, job_type: 'enhance_single', provider,
    model: provider === 'openai-gpt-image' ? IMAGE_MODEL : undefined,
    finish, prompt_version: FINISH_PROMPT_VERSION, directives,
    prompt_extra: extra || null,
    prompt: finishDirections(finish) + '\n\n' + composeEnhanceDirections({ ...directives, enhancementStyle: undefined, windowPull: false }) ,
  };
}
