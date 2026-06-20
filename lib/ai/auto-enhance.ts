import { buildPrompt, type EnhanceDirectives } from './prompts';
import type { EnhanceRecipe } from './recipe';

/**
 * Auto-enhance on upload — shared job construction.
 *
 * The "recommended recipe" for a base with no human direction is the full
 * signature luxury finish plus the scene auto-chain (so sky/window/lawn/
 * declutter/twilight follow-ups are applied only where vision flags them).
 * Used by both auto paths so they enqueue identical, reproducible jobs:
 *   • the runner, when an hdr_merge completes (merged HDR bases)
 *   • /api/ai/auto-enhance, for standalone JPEG singles
 */
export const AUTO_ENHANCE_DIRECTIVES: EnhanceDirectives = { enhancementStyle: 'signature' };

export function buildAutoEnhanceJobRow(opts: {
  orderId: string;
  baseId: string;
  providerId: string;
  createdBy: string | null;
}) {
  const directives = AUTO_ENHANCE_DIRECTIVES;
  const recipe: EnhanceRecipe = {
    job_type: 'enhance_single',
    provider: opts.providerId,
    directives,
    prompt_extra: null,
    prompt: buildPrompt('enhance_single', directives),
  };
  return {
    order_id: opts.orderId,
    job_type: 'enhance_single' as const,
    provider: opts.providerId,
    input_photo_ids: [opts.baseId],
    prompt: recipe.prompt,
    status: 'pending' as const,
    created_by: opts.createdBy,
    // auto_chain_fixes mirrors the Stage-2 default; auto_enhanced_on_upload marks
    // the provenance; recipe makes the edit reproducible / re-runnable.
    params: { auto_chain_fixes: true, recipe, auto_enhanced_on_upload: true } as any,
  };
}
