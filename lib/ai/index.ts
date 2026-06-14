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
 * Oceano Smart Enhance is the signature enhance engine: a deterministic Sharp
 * base (grey-world white balance, exposure, highlight recovery, vibrance — one
 * consistent temperature, no blown exteriors, no per-frame drift) followed by
 * vision analysis that chains generative fixes (window pull, sky, lawn, …) ONLY
 * where a photo needs them. This gives the reliable luxury look that pure
 * generative editing (GPT Image / Nano Banana — still selectable) couldn't hold
 * consistently. Pure exposure fusion (hdr_merge) and lawn green-up are also on
 * the deterministic pipeline.
 */
const DEFAULTS: Record<AiJobType, AiProviderId> = {
  hdr_merge: 'oceano-enhance',
  enhance_single: 'oceano-enhance',
  lawn_enhance: 'oceano-enhance',
  declutter: 'oceano-enhance',
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
