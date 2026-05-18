import type { AiJobType } from '@/lib/supabase/database.types';

export type AiProviderId = 'openai-gpt-image' | 'gemini-banana-pro';

/** A single source image passed to a provider. */
export interface SourceImage {
  /** Local buffer if already fetched. */
  bytes?: Buffer;
  /** Or a URL the provider can fetch (Supabase signed URL). */
  url?: string;
  filename: string;
  mimeType?: string;
  /** Bracket index (-2, -1, 0, +1, +2) when this is an HDR member. */
  bracketIndex?: number;
}

export interface AiRequest {
  jobType: AiJobType;
  inputs: SourceImage[];
  prompt?: string;
  /** Provider-specific knobs (size, fidelity, count, etc). */
  params?: Record<string, unknown>;
}

export interface AiOutput {
  bytes: Buffer;
  mimeType: string;
  filename: string;
}

export interface AiResponse {
  outputs: AiOutput[];
  model: string;
  costCents: number;
  rawPromptUsed?: string;
  /** Free-form notes from the provider for the audit log. */
  notes?: string;
}

export interface AiProvider {
  id: AiProviderId;
  displayName: string;
  /** Which job types this provider is best at. */
  supports: AiJobType[];
  /** Estimated price in cents per image output. */
  estimatedCostCents(req: AiRequest): number;
  process(req: AiRequest): Promise<AiResponse>;
}
