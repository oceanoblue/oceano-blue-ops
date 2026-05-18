import type { AiJobType } from '@/lib/supabase/database.types';
import { openaiGptImage } from './openai-gpt-image';
import { geminiBananaPro } from './gemini-banana-pro';
import type { AiProvider, AiProviderId } from './types';

const PROVIDERS: Record<AiProviderId, AiProvider> = {
  'openai-gpt-image': openaiGptImage,
  'gemini-banana-pro': geminiBananaPro,
};

/**
 * Default provider per job type. Editable in /dashboard/settings.
 * - HDR merge: Gemini handles multi-image input cleanly and is much cheaper.
 * - Heavy semantic edits (sky replace, virtual stage): GPT Image tends to be
 *   more faithful with architecture.
 */
const DEFAULTS: Record<AiJobType, AiProviderId> = {
  hdr_merge: 'gemini-banana-pro',
  enhance_single: 'gemini-banana-pro',
  sky_replace: 'openai-gpt-image',
  window_pull: 'gemini-banana-pro',
  lawn_enhance: 'gemini-banana-pro',
  declutter: 'openai-gpt-image',
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
