import OpenAI from 'openai';
import sharp from 'sharp';
import { SCENE_TYPES, type SceneType } from './scene';

/**
 * Vision-based scene classification for real estate photos. Server-only.
 *
 * Reuses the same OpenAI + sharp pattern as lib/ai/vision-analyze.ts: shrink
 * the image, ask gpt-4o-mini for a single label, parse strict JSON. Runs on the
 * stored THUMBNAIL (small JPEG) — full-resolution originals never reach the
 * server. Returns null when no OPENAI_API_KEY is configured, so the feature
 * degrades gracefully to heuristic + manual classification.
 */
const SYSTEM_PROMPT = `
You classify a single real estate photo into exactly one scene category.

Categories:
- interior: rooms inside the home (living room, kitchen, bedroom, bath, hall)
- exterior: the building/property from outside at ground level (front, back, yard)
- drone: aerial / overhead / elevated wide shot of property or neighborhood
- twilight: dusk/night exterior with warm interior glow and dark/colored sky
- amenity: shared community features (pool, gym, clubhouse, lobby, dock, golf)
- detail: tight close-up of a feature (faucet, fireplace, hardware, appliance)
- unknown: none of the above or unclear

Output strict JSON only: {"scene":"interior|exterior|drone|twilight|amenity|detail|unknown","confidence":0.0-1.0}
`.trim();

export interface SceneClassification {
  scene: SceneType;
  confidence: number;
}

export async function classifyScene(bytes: Buffer): Promise<SceneClassification | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const small = await sharp(bytes)
    .resize({ width: 768, withoutEnlargement: true })
    .jpeg({ quality: 80 })
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
            { type: 'text', text: 'Classify this real estate photo.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${small.toString('base64')}`, detail: 'low' },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 50,
    });
    const content = result.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const scene = (SCENE_TYPES as readonly string[]).includes(parsed.scene) ? parsed.scene : 'unknown';
    return { scene, confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5 };
  } catch (err) {
    console.error('[scene-classify] failed:', err);
    return null;
  }
}
