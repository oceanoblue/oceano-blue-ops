import { buildPrompt, type EnhanceDirectives } from './prompts';
import type { EnhanceRecipe } from './recipe';
import { AUTO_SCENE_FIXES } from './vision-analyze';

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
  /** Auto-apply the NON-DESTRUCTIVE scene fixes (sky/window/lawn) where vision
   *  flags them. Default true (org setting business_settings.auto_scene_fixes).
   *  Destructive ops (declutter/twilight/stage) always stay opt-in per photo. */
  sceneFixes?: boolean;
}) {
  const sceneFixes = opts.sceneFixes ?? true;
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
    // After the signature enhance, chain the non-destructive scene fixes
    // (sky/window/lawn) SCOPED by auto_chain_scope — never declutter/twilight/
    // stage automatically. auto_enhanced_on_upload marks provenance; recipe
    // makes it re-runnable.
    params: {
      auto_chain_fixes: sceneFixes,
      auto_chain_scope: AUTO_SCENE_FIXES,
      recipe,
      auto_enhanced_on_upload: true,
    } as any,
  };
}
