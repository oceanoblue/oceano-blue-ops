import OpenAI from 'openai';
import type { AiProvider, AiRequest, AiResponse } from './types';
import { buildPrompt } from './prompts';

/**
 * OpenAI GPT Image provider.
 *
 * Uses `images.edit` for single-image enhancement and HDR merge (passes the
 * brightest exposure as the primary input plus the rest as reference images).
 * The OpenAI image API accepts PNG/JPEG up to a few MB, so we expect Sharp to
 * pre-encode inputs before calling this.
 */
export const openaiGptImage: AiProvider = {
  id: 'openai-gpt-image',
  displayName: 'OpenAI GPT Image',
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

  estimatedCostCents(req) {
    // gpt-image-1 high-quality 1024x1024 ≈ $0.19/image as of 2025.
    // Bracket merges pass multiple inputs but produce a single output.
    return 19;
  },

  async process(req: AiRequest): Promise<AiResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const client = new OpenAI({ apiKey });
    const prompt = req.prompt ?? buildPrompt(req.jobType);
    const model = 'gpt-image-1';

    if (req.inputs.length === 0) {
      throw new Error('At least one input image is required');
    }

    // Build File objects from the source images.
    const imageFiles = await Promise.all(
      req.inputs.map(async (src, i) => {
        const bytes = src.bytes ?? (await (await fetch(src.url!)).arrayBuffer());
        const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
        return new File([buf], src.filename ?? `input-${i}.png`, {
          type: src.mimeType ?? 'image/png',
        });
      })
    );

    // OpenAI's edit endpoint accepts an array of images.
    const result = await client.images.edit({
      model,
      // @ts-expect-error — OpenAI SDK types accept File | File[] at runtime
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      prompt,
      size: '1536x1024',
      n: 1,
    } as never);

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image data');

    return {
      outputs: [
        {
          bytes: Buffer.from(b64, 'base64'),
          mimeType: 'image/png',
          filename: `${req.jobType}-${Date.now()}.png`,
        },
      ],
      model,
      costCents: openaiGptImage.estimatedCostCents(req),
      rawPromptUsed: prompt,
    };
  },
};
