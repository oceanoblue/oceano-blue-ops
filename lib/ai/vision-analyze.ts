import OpenAI from 'openai';
import sharp from 'sharp';
import type { AiJobType } from '@/lib/supabase/database.types';

/**
 * Vision-based scene analysis. Returns recommended downstream edits with
 * confidence scores. Shared by Smart Enhance (which uses it to plan a
 * deterministic-base pipeline) and by the runner's auto-chain pass (which
 * uses it to follow up after an AI provider runs the master prompt).
 *
 * Uses GPT-4o-mini at ~$0.0001/image. Safe to call after every enhance.
 */
export type AnalyzeEdit = Extract<
  AiJobType,
  'sky_replace' | 'window_pull' | 'lawn_enhance' | 'declutter' | 'twilight_convert'
>;

export interface VisionAnalysis {
  scene: 'interior' | 'exterior' | 'twilight' | 'unknown';
  recommendations: Partial<Record<AnalyzeEdit, number>>;
  notes: string;
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

Output strict JSON only:
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

export async function analyzePhoto(bytes: Buffer): Promise<VisionAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // Shrink for the vision call — saves tokens, gpt-4o handles tiny images
  // fine for scene-level analysis.
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
    console.error('[vision-analyze] failed:', err);
    return null;
  }
}

/**
 * Convert analysis recommendations into an ordered list of edits whose
 * confidence clears the threshold. Order matters: destructive edits first
 * (sky/window) before cosmetic (lawn/declutter). Twilight is mutually
 * exclusive with sky replace.
 */
export function planEdits(
  analysis: VisionAnalysis,
  threshold = 0.65
): AnalyzeEdit[] {
  const plan: AnalyzeEdit[] = [];
  const rec = analysis.recommendations;

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
