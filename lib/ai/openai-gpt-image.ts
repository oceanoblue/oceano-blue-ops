import OpenAI from 'openai';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { AiProvider, AiRequest, AiResponse } from './types';
import { buildPrompt } from './prompts';
import { IMAGE_MODEL, SURFACE_DIRECTIONS, imageEditSize } from './finishing';
import { recipeFromParams } from './recipe';

export const openaiGptImage: AiProvider = {
  id: 'openai-gpt-image',
  displayName: 'Oceano AI · GPT Image 2.5 Sunburst',
  supports: ['enhance_single', 'hdr_merge', 'sky_replace', 'window_pull', 'lawn_enhance', 'declutter', 'twilight_convert', 'virtual_stage'],
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
  // Budget estimate only. Token usage is recorded separately in provenance.
  estimatedCostCents: () => 25,
  async process(req: AiRequest): Promise<AiResponse> {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    if (!req.inputs.length) throw new Error('At least one input image is required');
    const recipe = recipeFromParams(req.params);
    const model = recipe?.model ?? process.env.OPENAI_IMAGE_MODEL ?? IMAGE_MODEL;
    const quality = recipe?.finish?.quality ?? 'high';
    // Ambiguous network failures must not silently trigger another paid render.
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 240_000 });
    const buffers = await Promise.all(req.inputs.map(async (src) => {
      if (src.bytes) return src.bytes;
      if (!src.url) throw new Error('missing_image_source');
      const response = await fetch(src.url);
      if (!response.ok) throw new Error(`image_download_failed: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    }));
    const source = await sharp(buffers[0]).metadata();
    const size = imageEditSize(source.width ?? 0, source.height ?? 0);
    const basePrompt = req.prompt ?? recipe?.prompt ?? buildPrompt(req.jobType);
    const prompt = basePrompt.includes('SURFACE FIDELITY:') ? basePrompt : basePrompt + '\n' + SURFACE_DIRECTIONS;
    const images = buffers.map((bytes, i) => new File([new Uint8Array(bytes)], req.inputs[i].filename || `input-${i}.jpg`, { type: req.inputs[i].mimeType ?? 'image/jpeg' }));
    const result = await client.images.edit({
      model, image: images.length === 1 ? images[0] : images,
      prompt, size, quality, output_format: 'png', n: 1,
    } as never);
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image data');
    const bytes = Buffer.from(b64, 'base64');
    const output = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata();
    if (!output.width || !output.height || Math.abs((output.width / output.height) / (source.width! / source.height!) - 1) > 0.03) {
      throw new Error('image_edit_changed_aspect_ratio');
    }
    if (!['jpeg', 'png', 'webp'].includes(output.format ?? '')) throw new Error('invalid_image_output');
    const mimeType = output.format === 'jpeg' ? 'image/jpeg' : `image/${output.format}`;
    return {
      outputs: [{ bytes, mimeType, filename: `${req.jobType}-${Date.now()}.${output.format === 'jpeg' ? 'jpg' : output.format}` }],
      model, costCents: openaiGptImage.estimatedCostCents(req), rawPromptUsed: prompt,
      provenance: {
        model, quality, requestedSize: size, width: output.width, height: output.height, outputFormat: output.format,
        inputSha256: buffers.map(b => createHash('sha256').update(b).digest('hex')),
        usage: (result as unknown as { usage?: unknown }).usage ?? null,
        costIsEstimate: true, reviewRequired: true, fidelityGuaranteed: false,
      },
    };
  },
};
