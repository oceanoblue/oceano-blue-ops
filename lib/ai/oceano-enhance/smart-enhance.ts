import OpenAI from 'openai';
import sharp from 'sharp';
import type { AiJobType } from '@/lib/supabase/database.types';
import { enhanceSingle, type EnhanceOptions } from './pipeline';
import { openaiGptImage } from '../openai-gpt-image';
import { geminiBananaPro } from '../gemini-banana-pro';
import { buildPrompt } from '../prompts';
import { loadEnhanceSettings } from './settings';

/**
 * Smart Enhance — the "do everything automatically" mode.
 *
 * Flow:
 *   1. Run the deterministic Sharp pipeline on every photo (always cheap, no
 *      hallucinations, gets WB / exposure / contrast / vibrance right).
 *   2. Send the result to GPT-4o-mini with a structured prompt asking it to
 *      analyze the scene and decide which downstream edits (sky replace,
 *      window pull, lawn enhance, declutter, twilight) the photo would
 *      benefit from. Cheap: ~$0.0001/image.
 *   3. For each edit the analyzer flagged, call the best downstream provider
 *      with the appropriate prompt. Each generative call operates on the
 *      previous step's output, so edits compose naturally.
 *   4. Return the final composite plus the analysis log so the UI can show
 *      "we boosted shadows + replaced sky".
 *
 * If GPT-4o-mini isn't available (no OPENAI_API_KEY), we skip the analyzer
 * and just return the deterministic-only result.
 */

export type SmartEdit = AiJobType;

export interface SmartAnalysis {
  scene: 'interior' | 'exterior' | 'twilight' | 'unknown';
  /** Confidence each edit would improve the photo (0–1). */
  recommendations: Partial<Record<SmartEdit, number>>;
  /** Human-readable summary for the audit log. */
  notes: string;
}

export interface SmartEnhanceResult {
  bytes: Buffer;
  analysis: SmartAnalysis | null;
  editsApplied: SmartEdit[];
  costCents: number;
}

const SYSTEM_PROMPT = `
You are a senior real estate photo editor. Given a single photo from an MLS
listing, decide which AI edits would meaningfully improve it. Be conservative —
only flag an edit if it would clearly help. Listings should look natural, not
over-processed.

Available edits:
- sky_replace: exterior shot with a dull, grey, overcast, or unflattering sky
- window_pull: interior shot with blown-out (pure white) windows that need
  exterior detail pulled back
- lawn_enhance: exterior with patchy, brown, or yellow grass that needs green
- declutter: visible personal items (mail, charging cables, soap, magazines)
- twilight_convert: daytime exterior the seller wants shown at twilight

Do NOT recommend an edit for:
- Photos that already look good
- Interior shots without visible windows (no window_pull)
- Sky that's already blue and clean (no sky_replace)
- Grass that's already healthy green (no lawn_enhance)

Output strict JSON only, matching this schema:
{
  "scene": "interior" | "exterior" | "twilight" | "unknown",
  "recommendations": {
    "sky_replace": 0.0-1.0,
    "window_pull": 0.0-1.0,
    "lawn_enhance": 0.0-1.0,
    "declutter": 0.0-1.0,
    "twilight_convert": 0.0-1.0
  },
  "notes": "1-2 sentence explanation"
}

Use 0 for "don't apply", 0.5+ for "would help", 0.8+ for "really needs it".
Omit edits you don't want applied — only include keys with values ≥ 0.5.
`.trim();

async function analyze(bytes: Buffer): Promise<SmartAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // Shrink for the vision call — saves tokens, gpt-4o handles tiny images
  // fine for scene analysis.
  const small = await sharp(bytes)
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const client = new OpenAI({ apiKey });
  try {
    const result = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this real estate listing photo.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${small.toString('base64')}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    });

    const content = result.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return {
      scene: parsed.scene ?? 'unknown',
      recommendations: parsed.recommendations ?? {},
      notes: parsed.notes ?? '',
    };
  } catch (err) {
    // Vision analysis is best-effort — never blow up the whole job over it.
    console.error('[smart-enhance] analysis failed:', err);
    return null;
  }
}

/**
 * Decide which edits to actually apply. We require a confidence threshold so
 * marginal recommendations don't burn API credits. Threshold is conservative
 * by default.
 */
function planEdits(analysis: SmartAnalysis, threshold = 0.65): SmartEdit[] {
  const plan: SmartEdit[] = [];
  const rec = analysis.recommendations;

  // Order matters — destructive edits first (sky, window) before cosmetic
  // (lawn, declutter). Twilight conversion is mutually exclusive with sky
  // replacement.
  if ((rec.twilight_convert ?? 0) >= threshold) {
    plan.push('twilight_convert');
  } else if ((rec.sky_replace ?? 0) >= threshold) {
    plan.push('sky_replace');
  }
  if ((rec.window_pull ?? 0) >= threshold) plan.push('window_pull');
  if ((rec.lawn_enhance ?? 0) >= threshold) plan.push('lawn_enhance');
  if ((rec.declutter ?? 0) >= threshold) plan.push('declutter');

  return plan;
}

/** Run a single downstream edit. Returns the new bytes + dollar cost. */
async function applyEdit(
  edit: SmartEdit,
  bytes: Buffer,
  filename: string
): Promise<{ bytes: Buffer; costCents: number }> {
  // Route each edit to the provider that's best for it. Same defaults as the
  // top-level provider router, but inlined here so we don't recurse.
  const provider =
    edit === 'window_pull' || edit === 'lawn_enhance'
      ? geminiBananaPro
      : openaiGptImage;

  const resp = await provider.process({
    jobType: edit,
    inputs: [{ bytes, filename, mimeType: 'image/jpeg' }],
    prompt: buildPrompt(edit),
  });
  const out = resp.outputs[0];
  if (!out) throw new Error(`Provider returned no output for ${edit}`);
  return { bytes: out.bytes, costCents: resp.costCents };
}

export async function smartEnhance(
  inputBuf: Buffer,
  filename: string,
  options?: EnhanceOptions
): Promise<SmartEnhanceResult> {
  // 1. Run deterministic pipeline as the base — fast and free.
  const settings = await loadEnhanceSettings();
  const base = await enhanceSingle(inputBuf, { ...settings, ...options });

  // 2. Analyze the base to decide what generative edits are worth it.
  const analysis = await analyze(base.bytes);

  // 3. No analyzer or nothing recommended: return the deterministic result.
  if (!analysis) {
    return {
      bytes: base.bytes,
      analysis: null,
      editsApplied: [],
      costCents: 0,
    };
  }
  const plan = planEdits(analysis);
  if (plan.length === 0) {
    return {
      bytes: base.bytes,
      analysis,
      editsApplied: [],
      costCents: 0,
    };
  }

  // 4. Apply each edit in sequence. Each step gets the previous step's bytes.
  let current = base.bytes;
  let totalCost = 0;
  const applied: SmartEdit[] = [];
  for (const edit of plan) {
    try {
      const r = await applyEdit(edit, current, filename);
      current = r.bytes;
      totalCost += r.costCents;
      applied.push(edit);
    } catch (err) {
      // One bad provider shouldn't kill the whole enhance — keep going with
      // what we have so far.
      console.error(`[smart-enhance] ${edit} failed:`, err);
    }
  }

  return {
    bytes: current,
    analysis,
    editsApplied: applied,
    costCents: totalCost,
  };
}
