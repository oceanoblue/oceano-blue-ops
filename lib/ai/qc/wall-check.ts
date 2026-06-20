import OpenAI from 'openai';
import sharp from 'sharp';

/**
 * AI fidelity check: compare an enhanced photo against its ORIGINAL (the frame
 * the enhance ran on) and report whether the edit changed any material colors —
 * the classic failure where a white wall drifts to cream/blue/green, or
 * cabinetry/floor tones shift. Also judges overall white-balance neutrality and
 * color accuracy. Uses GPT-4o-mini vision (~$0.0002 / pair) — cheap enough to
 * run across a delivery set.
 *
 * Returns null when OPENAI_API_KEY is absent (caller degrades to the
 * deterministic consistency check only).
 */
export interface WallCheckResult {
  wall_drift: boolean;
  white_balance_ok: boolean;
  color_accuracy: 'good' | 'fair' | 'poor';
  notes: string;
}

const SYSTEM_PROMPT = `
You are a senior real estate photo QC reviewer. You are shown two versions of the
SAME photo: BEFORE (the original capture) and AFTER (the AI-edited version that
will be delivered). Judge ONLY color fidelity, not composition or sharpness.

Check for:
- wall_drift: did the edit change the actual color of any architectural materials
  — walls, ceilings, trim, cabinetry, countertops, flooring — in a way that is
  NOT just a white-balance/exposure correction? (e.g. a true-white wall now looks
  cream, beige, blue, or green; wood tone shifted hue). Brightening or neutralizing
  is fine; changing a material's real color is NOT.
- white_balance_ok: does the AFTER read as a clean, natural, single-temperature
  white balance (neutrals look neutral, no global yellow/blue/green/magenta cast)?
- color_accuracy: overall, good / fair / poor.

Be strict about wall_drift but do not flag normal, tasteful brightening or a mild
warm-neutral finish. Output STRICT JSON only:
{ "wall_drift": bool, "white_balance_ok": bool, "color_accuracy": "good"|"fair"|"poor", "notes": "one short sentence" }
`.trim();

async function small(buf: Buffer): Promise<string> {
  const out = await sharp(buf)
    .rotate()
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${out.toString('base64')}`;
}

export async function wallCheck(original: Buffer, edited: Buffer): Promise<WallCheckResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const [beforeUrl, afterUrl] = await Promise.all([small(original), small(edited)]);
    const client = new OpenAI({ apiKey });
    const result = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'BEFORE (original):' },
            { type: 'image_url', image_url: { url: beforeUrl, detail: 'low' } },
            { type: 'text', text: 'AFTER (edited / to be delivered):' },
            { type: 'image_url', image_url: { url: afterUrl, detail: 'low' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    });
    const content = result.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const accuracy = ['good', 'fair', 'poor'].includes(parsed.color_accuracy)
      ? parsed.color_accuracy
      : 'fair';
    return {
      wall_drift: !!parsed.wall_drift,
      white_balance_ok: parsed.white_balance_ok !== false,
      color_accuracy: accuracy,
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  } catch {
    return null;
  }
}
