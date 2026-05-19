import type { AiProvider, AiRequest, AiResponse } from './types';
import { buildPrompt } from './prompts';

/**
 * Google Gemini "Banana Pro" (Imagen 3 / Nano Banana family) image provider.
 *
 * Uses the Gemini REST API. The model name is configurable so you can swap
 * between fast (Nano Banana) and pro (Banana Pro) tiers per job type.
 */
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Default to the GA Nano Banana (gemini-2.5-flash-image) — works on free
// tier. Pro tier (gemini-3-pro-image-preview) requires a paid AI Studio
// plan; set GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview once you've
// upgraded and want the higher-fidelity output.
const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

export const geminiBananaPro: AiProvider = {
  id: 'gemini-banana-pro',
  displayName: 'Gemini Banana Pro',
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

  estimatedCostCents() {
    // gemini-3-pro-image-preview ≈ $0.134/image at 1K-2K, ~$0.24 at 4K.
    return 13;
  },

  async process(req: AiRequest): Promise<AiResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

    const prompt = req.prompt ?? buildPrompt(req.jobType);
    const model = DEFAULT_MODEL;

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

    const r = await fetch(`${ENDPOINT(model)}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errBody = await r.text();
      throw new Error(`Gemini ${model} HTTP ${r.status}: ${errBody.slice(0, 500)}`);
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
      costCents: geminiBananaPro.estimatedCostCents(req),
      rawPromptUsed: prompt,
    };
  },
};
