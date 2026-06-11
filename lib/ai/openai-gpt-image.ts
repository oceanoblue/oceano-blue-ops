import OpenAI from 'openai';
import sharp from 'sharp';
import type { AiProvider, AiRequest, AiResponse } from './types';
import { buildPrompt } from './prompts';

// Output sizes, raised from the old 1536x1024 so house numbers and fine text
// stay legible. gpt-image-2 accepts custom sizes (multiples of 16, longest
// edge <= 3840, aspect <= 3:1) and always processes inputs at high fidelity.
// Orientation-matched so portraits aren't squeezed into a landscape canvas.
// Override all of them with OPENAI_IMAGE_SIZE (e.g. 3072x2048 ~6MP 3:2, or
// 3840x2160 for 4K 16:9).
const SIZE_LANDSCAPE = '2304x1536'; // 3:2, ~3.5MP
const SIZE_PORTRAIT = '1536x2304';
const SIZE_SQUARE = '2048x2048';
const SIZE_FALLBACK = '1536x1024'; // known-good if a custom size is ever rejected

async function pickOutputSize(firstInput: Buffer): Promise<string> {
  const override = process.env.OPENAI_IMAGE_SIZE;
  if (override) return override;
  try {
    const meta = await sharp(firstInput).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (h > w * 1.1) return SIZE_PORTRAIT;
    if (w > h * 1.1) return SIZE_LANDSCAPE;
    return SIZE_SQUARE;
  } catch {
    return SIZE_LANDSCAPE;
  }
}

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

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  },

  estimatedCostCents(req) {
    // gpt-image-2 native 2K ≈ $0.12/image; 4K upscale ≈ $0.24/image.
    // We default to 2K — editors can re-run a final select set at 4K.
    return 12;
  },

  async process(req: AiRequest): Promise<AiResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const client = new OpenAI({ apiKey });
    const prompt = req.prompt ?? buildPrompt(req.jobType);
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

    if (req.inputs.length === 0) {
      throw new Error('At least one input image is required');
    }

    // Build buffers + File objects from the source images.
    const buffers = await Promise.all(
      req.inputs.map(async (src) => {
        const bytes = src.bytes ?? (await (await fetch(src.url!)).arrayBuffer());
        return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      })
    );
    const imageFiles = buffers.map(
      (buf, i) =>
        new File([buf], req.inputs[i].filename ?? `input-${i}.png`, {
          type: req.inputs[i].mimeType ?? 'image/png',
        })
    );

    const size = await pickOutputSize(buffers[0]);
    const image = imageFiles.length === 1 ? imageFiles[0] : imageFiles;

    // gpt-image-2 accepts custom sizes; if a size is ever rejected, fall back to
    // the known-good landscape size so the enhance still succeeds.
    async function edit(outSize: string) {
      return client.images.edit({
        model,
        image, // OpenAI SDK accepts File | File[] at runtime
        prompt,
        size: outSize,
        n: 1,
      } as never);
    }
    let result;
    try {
      result = await edit(size);
    } catch (e: any) {
      if (size !== SIZE_FALLBACK && /size|dimension|invalid|unsupported/i.test(e?.message ?? '')) {
        result = await edit(SIZE_FALLBACK);
      } else {
        throw e;
      }
    }

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
