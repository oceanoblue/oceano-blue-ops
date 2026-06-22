import type { AiProvider, AiRequest, AiResponse, SourceImage } from '../types';
import { enhanceSingle, mergeBrackets } from './pipeline';
import { loadEnhanceSettings } from './settings';
import { smartEnhance } from './smart-enhance';
import { geminiBananaPro } from '../gemini-banana-pro';
import { openaiGptImage } from '../openai-gpt-image';
import { editEngineConfigured, runEditEngine } from '../edit-engine';

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

  // Deterministic core is always available. Generative delegations (sky /
  // window / twilight / staging) still need the relevant API key at run time,
  // but the provider itself is always selectable.
  isConfigured() {
    return true;
  },

  estimatedCostCents(req) {
    // Deterministic jobs are free (just our compute). enhance_single uses
    // Smart Enhance which runs a $0.0001 vision analysis and may chain one
    // or two generative edits depending on what the photo needs. Worst case
    // we budget for one sky replace.
    switch (req.jobType) {
      case 'enhance_single':
        return 13; // base 0 + analyze 0 + maybe one sky/window edit
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
      case 'enhance_single': {
        const src = req.inputs[0];
        const buf = await bufFromSource(src);
        // Preferred path: the deterministic Python edit engine applies the
        // faithful finishing grade (auto WB, denoise, local contrast, tone /
        // black point, gentle saturation, edge-aware sharpen). No hallucination.
        if (editEngineConfigured()) {
          const bytes = await runEditEngine([{ bytes: buf, filename: src.filename }], {
            mode: 'grade',
            targetLongEdge: opts.targetLongEdge ?? 4000,
            quality: opts.jpegQuality ?? 90,
          });
          return {
            outputs: [{ bytes, mimeType: 'image/jpeg', filename: `enhance_single-${Date.now()}.jpg` }],
            model: 'oceano-edit-engine/grade-v1',
            costCents: 0,
            rawPromptUsed: '(deterministic edit engine: grade)',
          };
        }
        // Fallback (engine not configured): legacy JS smart-enhance.
        const result = await smartEnhance(buf, src.filename, opts);
        const editLog = result.editsApplied.length
          ? `applied: ${result.editsApplied.join(' → ')}`
          : 'deterministic only';
        return {
          outputs: [
            {
              bytes: result.bytes,
              mimeType: 'image/jpeg',
              filename: `enhance_single-${Date.now()}.jpg`,
            },
          ],
          model: 'oceano-enhance/smart-v1',
          costCents: result.costCents,
          rawPromptUsed: result.analysis?.notes ?? '(no analyzer)',
          notes: editLog,
        };
      }

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
            filename: src.filename,
          }))
        );
        // Preferred path: proper Mertens multi-scale exposure fusion on the edit
        // engine (preserves local contrast — no flat/washed merges).
        if (editEngineConfigured()) {
          const ordered = [...brackets].sort(
            (a, b) => (a.bracketIndex ?? 0) - (b.bracketIndex ?? 0)
          );
          const bytes = await runEditEngine(
            ordered.map((b) => ({ bytes: b.bytes, filename: b.filename })),
            { mode: 'fuse', targetLongEdge: 4096, quality: 95 }
          );
          return {
            outputs: [{ bytes, mimeType: 'image/jpeg', filename: `hdr_merge-${Date.now()}.jpg` }],
            model: 'oceano-edit-engine/fuse-v1',
            costCents: 0,
            rawPromptUsed: '(deterministic edit engine: Mertens fusion)',
          };
        }
        // Fallback (engine not configured): legacy JS exposure fusion.
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
