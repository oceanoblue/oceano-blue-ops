import type { AiProvider, AiProviderId, AiRequest, AiResponse } from './types';
import { buildPrompt } from './prompts';

/**
 * Google Gemini "Nano Banana" image providers.
 *
 * Two selectable tiers, both used as the *secondary* enhance engines behind
 * GPT Image 2.0:
 *   - Nano Banana 2   → gemini-3.1-flash-image  (fast, high-volume)
 *   - Nano Banana Pro → gemini-3-pro-image      (reasoning, highest fidelity)
 *
 * Both do native image-to-image editing via generateContent (input image +
 * instruction → edited image), which is ideal for "keep the scene, enhance it."
 */
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pull Google's suggested retry delay (seconds) out of a 429/503 body. */
function parseRetryDelayMs(body: string): number | null {
  const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000);
  return null;
}

function isConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Build a Nano Banana provider bound to a specific Gemini image model. */
function makeGeminiProvider(opts: {
  id: AiProviderId;
  displayName: string;
  model: string;
  costCents: number;
}): AiProvider {
  return {
    id: opts.id,
    displayName: opts.displayName,
    supports: [
      'enhance_single',
      'hdr_merge',
      'sky_replace',
      'window_pull',
      'lawn_enhance',
      'declutter',
      'twilight_convert',
      'virtual_stage',
    ],

    isConfigured,

    estimatedCostCents() {
      // Nano Banana Pro ≈ $0.134/image at 1K-2K, ~$0.24 at 4K.
      return opts.costCents;
    },

    async process(req: AiRequest): Promise<AiResponse> {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

      const prompt = req.prompt ?? buildPrompt(req.jobType);
      const model = opts.model;

      // Build the parts: prompt text plus each input image as inlineData.
      const parts: Array<Record<string, unknown>> = [{ text: prompt }];
      for (const src of req.inputs) {
        const bytes = src.bytes ?? Buffer.from(await (await fetch(src.url!)).arrayBuffer());
        const mime = src.mimeType ?? 'image/jpeg';
        parts.push({
          inlineData: {
            mimeType: mime,
            data: Buffer.isBuffer(bytes) ? bytes.toString('base64') : Buffer.from(bytes).toString('base64'),
          },
        });
      }

      const body = {
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
      };

      // Retry on rate-limit (429) / transient overload (503): Google returns a
      // suggested retryDelay (the per-minute window resets), so wait that long
      // (capped) and try again rather than failing the job. Up to 4 attempts.
      const MAX_ATTEMPTS = 4;
      const MAX_WAIT_MS = 45_000;
      let r: Response;
      let attempt = 0;
      for (;;) {
        r = await fetch(`${ENDPOINT(model)}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) break;
        const errBody = await r.text();
        const retryable = r.status === 429 || r.status === 503;
        attempt += 1;
        if (!retryable || attempt >= MAX_ATTEMPTS) {
          throw new Error(`Gemini ${model} HTTP ${r.status}: ${errBody.slice(0, 500)}`);
        }
        const suggested = parseRetryDelayMs(errBody);
        const backoff = Math.min(suggested ?? attempt * 12_000, MAX_WAIT_MS);
        await sleep(backoff);
      }

      const data: any = await r.json();
      const candidate = data?.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find((p: any) => p?.inlineData?.data);
      if (!imagePart) {
        throw new Error(`Gemini ${model} returned no image: ${JSON.stringify(data).slice(0, 300)}`);
      }

      return {
        outputs: [
          {
            bytes: Buffer.from(imagePart.inlineData.data, 'base64'),
            mimeType: imagePart.inlineData.mimeType || 'image/png',
            filename: `${req.jobType}-${Date.now()}.png`,
          },
        ],
        model,
        costCents: opts.costCents,
        rawPromptUsed: prompt,
      };
    },
  };
}

/** Nano Banana 2 — gemini-3.1-flash-image (fast secondary engine). */
export const geminiNanoBanana2 = makeGeminiProvider({
  id: 'gemini-nano-banana-2',
  displayName: 'Nano Banana 2',
  model: process.env.GEMINI_NANO_BANANA_2_MODEL || 'gemini-3.1-flash-image',
  costCents: 4,
});

/** Nano Banana Pro — gemini-3-pro-image (highest-fidelity secondary engine). */
export const geminiNanoBananaPro = makeGeminiProvider({
  id: 'gemini-nano-banana-pro',
  displayName: 'Nano Banana Pro',
  model: process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image',
  costCents: 13,
});

/**
 * Legacy export name. Older modules (smart-enhance, oceano-enhance) import
 * `geminiBananaPro`; keep it pointing at the Pro tier.
 */
export const geminiBananaPro = geminiNanoBananaPro;
