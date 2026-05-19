import type { AiProvider, AiRequest, AiResponse, SourceImage } from '../types';
import { enhanceSingle, mergeBrackets } from './pipeline';
import { loadEnhanceSettings } from './settings';
import { geminiBananaPro } from '../gemini-banana-pro';
import { openaiGptImage } from '../openai-gpt-image';

/**
 * Oceano Enhance — our internal real-estate retouch provider.
 *
 * It owns four job types entirely with deterministic image processing
 * (no AI, no hallucination, no per-image cost beyond compute):
 *   - enhance_single
 *   - hdr_merge
 *   - lawn_enhance
 *   - declutter (light: just runs enhance_single — destructive declutter is
 *     deferred until we have a proper segmentation model)
 *
 * For the remaining job types — sky_replace, window_pull, twilight_convert,
 * virtual_stage — it transparently delegates to the best generative provider
 * for the job, because those require semantic edits no amount of curve work
 * can fake. This way "Oceano Enhance" is a single selectable option in the
 * UI that does the right thing for every job type.
 */
async function bufFromSource(src: SourceImage): Promise<Buffer> {
  if (src.bytes) return Buffer.isBuffer(src.bytes) ? src.bytes : Buffer.from(src.bytes);
  if (src.url) {
    const r = await fetch(src.url);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error(`Source ${src.filename} has no bytes or url`);
}

export const oceanoEnhance: AiProvider = {
  id: 'oceano-enhance',
  displayName: 'Oceano Enhance',
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
    // Deterministic jobs are free (just our compute). Delegated jobs inherit
    // the underlying provider's cost.
    switch (req.jobType) {
      case 'enhance_single':
      case 'hdr_merge':
      case 'lawn_enhance':
      case 'declutter':
        return 0;
      case 'sky_replace':
      case 'twilight_convert':
      case 'virtual_stage':
        return openaiGptImage.estimatedCostCents(req);
      case 'window_pull':
        return geminiBananaPro.estimatedCostCents(req);
      default:
        return 0;
    }
  },

  async process(req: AiRequest): Promise<AiResponse> {
    if (req.inputs.length === 0) {
      throw new Error('At least one input image is required');
    }

    // Pull the latest user-tuned knobs once per job.
    const opts = await loadEnhanceSettings();

    switch (req.jobType) {
      case 'enhance_single':
      case 'lawn_enhance':
      case 'declutter': {
        const src = req.inputs[0];
        const buf = await bufFromSource(src);
        const result = await enhanceSingle(buf, opts);
        return {
          outputs: [
            {
              bytes: result.bytes,
              mimeType: 'image/jpeg',
              filename: `${req.jobType}-${Date.now()}.jpg`,
            },
          ],
          model: 'oceano-enhance/sharp-v1',
          costCents: 0,
          rawPromptUsed: '(deterministic pipeline)',
        };
      }

      case 'hdr_merge': {
        const brackets = await Promise.all(
          req.inputs.map(async (src) => ({
            bytes: await bufFromSource(src),
            bracketIndex: src.bracketIndex,
          }))
        );
        const result = await mergeBrackets(brackets, opts);
        return {
          outputs: [
            {
              bytes: result.bytes,
              mimeType: 'image/jpeg',
              filename: `hdr_merge-${Date.now()}.jpg`,
            },
          ],
          model: 'oceano-enhance/sharp-v1',
          costCents: 0,
          rawPromptUsed: '(exposure fusion)',
        };
      }

      case 'sky_replace':
      case 'twilight_convert':
      case 'virtual_stage':
        // These need real semantic understanding; delegate to GPT Image 2.
        return openaiGptImage.process(req);

      case 'window_pull':
        // Gemini handles multi-region edits cheaper than GPT Image.
        return geminiBananaPro.process(req);

      default:
        throw new Error(`Oceano Enhance does not support ${req.jobType}`);
    }
  },
};
