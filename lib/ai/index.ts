import type { AiJobType } from '@/lib/supabase/database.types';
import { openaiGptImage } from './openai-gpt-image';
import { geminiNanoBanana2, geminiNanoBananaPro } from './gemini-banana-pro';
import { oceanoEnhance } from './oceano-enhance';
import { autoenhance } from './autoenhance';
import type { AiProvider, AiProviderId } from './types';

const PROVIDERS: Record<AiProviderId, AiProvider> = {
  'oceano-enhance': oceanoEnhance,
  autoenhance: autoenhance,
  'openai-gpt-image': openaiGptImage,
  'gemini-nano-banana-2': geminiNanoBanana2,
  'gemini-nano-banana-pro': geminiNanoBananaPro,
  // Legacy alias → Nano Banana Pro (keeps old ai_jobs.provider rows resolving).
  'gemini-banana-pro': geminiNanoBananaPro,
};

/**
 * Default provider per job type. Editable in /dashboard/settings.
 *
 * enhance_single runs on Nano Banana Pro (Gemini 3 Pro Image) — a true
 * image-to-image editor ("keep the scene, enhance it"), driven by the
 * front-loaded FIDELITY LOCK prompt so it stays loyal to the original (same
 * appliances, walls, floors, furniture, colours, numbers) while improving
 * exposure, neutral whites, colour, and sharpness for a luxury finish. This
 * replaces GPT Image, which regenerated rooms instead of retouching them.
 * The deterministic Oceano pipeline remains selectable as the guaranteed-
 * faithful, zero-cost fallback (and still owns the exposure fusion hdr_merge).
 * The genuinely generative jobs (sky / window / twilight / staging / destructive
 * declutter) are opt-in per-photo tools, never part of the automatic enhance.
 */
const DEFAULTS: Record<AiJobType, AiProviderId> = {
  hdr_merge: 'oceano-enhance',
  enhance_single: 'gemini-nano-banana-pro',
  lawn_enhance: 'oceano-enhance',
  declutter: 'openai-gpt-image',
  sky_replace: 'openai-gpt-image',
  window_pull: 'openai-gpt-image',
  twilight_convert: 'openai-gpt-image',
  virtual_stage: 'openai-gpt-image',
};

export function getProvider(idOrAuto: AiProviderId | 'auto', jobType: AiJobType): AiProvider {
  const id = idOrAuto === 'auto' ? DEFAULTS[jobType] : idOrAuto;
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Unknown AI provider: ${id}`);
  return provider;
}

export function listProviders(): AiProvider[] {
  return Object.values(PROVIDERS);
}

export { PROVIDERS, DEFAULTS };
export * from './types';
export * from './prompts';
