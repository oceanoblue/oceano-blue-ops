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
 * GPT Image 2.0 is the signature enhance engine — it carries the luxury
 * real-estate look (neutral whites, true-to-life color, sky/window pulls)
 * defined in lib/ai/prompts.ts. Nano Banana 2 / Pro are selectable secondary
 * engines. Pure exposure fusion (hdr_merge) and lawn green-up stay on the
 * deterministic Oceano pipeline — zero cost, zero hallucination — before the
 * GPT Image enhance pass runs on the merged result.
 */
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
