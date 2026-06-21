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
 * The signature enhance (enhance_single) and the exposure fusion (hdr_merge)
 * run on the deterministic Oceano pipeline so the output stays FAITHFUL to the
 * original photo — tone, colour, exposure and sharpening only, never a
 * regenerated scene. (GPT Image is a generative model: asked to "enhance" a
 * room it re-invents appliances, walls, floors and furniture, which is
 * misrepresentation for a real listing.) The genuinely generative jobs —
 * sky_replace / window_pull / twilight / staging / destructive declutter —
 * still use a generative provider, but they're opt-in per-photo tools the
 * operator triggers deliberately, never part of the automatic enhance.
 */
const DEFAULTS: Record<AiJobType, AiProviderId> = {
  hdr_merge: 'oceano-enhance',
  enhance_single: 'oceano-enhance',
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
