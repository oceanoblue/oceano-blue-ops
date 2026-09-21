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

/** Generative finishing uses the same provider for manual and automatic jobs.
 * RAW decoding and exposure fusion remain owned by the deterministic worker. */
const DEFAULTS: Record<AiJobType, AiProviderId> = {
  hdr_merge: 'oceano-enhance',
  enhance_single: 'openai-gpt-image',
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
