import type { AiJobType } from '@/lib/supabase/database.types';
import { openaiGptImage } from './openai-gpt-image';
import { geminiBananaPro } from './gemini-banana-pro';
import { oceanoEnhance } from './oceano-enhance';
import { autoenhance } from './autoenhance';
import type { AiProvider, AiProviderId } from './types';

const PROVIDERS: Record<AiProviderId, AiProvider> = {
  'oceano-enhance': oceanoEnhance,
  autoenhance: autoenhance,
  'openai-gpt-image': openaiGptImage,
  'gemini-banana-pro': geminiBananaPro,
};

/**
 * Default provider per job type. Editable in /dashboard/settings.
 * - Deterministic jobs (HDR merge, single-shot enhance, lawn, light declutter):
 *   default to Oceano Enhance — zero per-image cost, zero hallucination.
 * - Semantic jobs (sky/twilight/staging/window pull): default to whichever
 *   generation model handles that edit most faithfully.
 */
const DEFAULTS: Record<AiJobType, AiProviderId> = {
  hdr_merge: 'oceano-enhance',
  enhance_single: 'oceano-enhance',
  lawn_enhance: 'oceano-enhance',
  declutter: 'oceano-enhance',
  sky_replace: 'openai-gpt-image',
  window_pull: 'gemini-banana-pro',
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
