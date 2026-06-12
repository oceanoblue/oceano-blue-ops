import OpenAI from 'openai';
import sharp from 'sharp';
import { ROOM_TYPES, normalizeRoomType, type RoomType } from '@/lib/photos/rooms';

/**
 * Vision-based room / area classification. Given a single listing photo, return
 * which area of the property it shows (living room, primary bedroom, kitchen,
 * exterior, …) from the shared taxonomy, with a confidence score.
 *
 * Same model + cost profile as vision-analyze (GPT-4o-mini, low-detail, ~$0.0001
 * per image), so it's cheap to run across a whole gallery. Returns null if no
 * API key is configured or the call fails, so callers degrade gracefully.
 */
export interface RoomClassification {
  roomType: RoomType;
  confidence: number;
}

const SYSTEM_PROMPT = `
You are a real estate photo cataloguer. Given a single listing photo, identify
which area of the property it depicts. Choose exactly ONE value from this list:

${ROOM_TYPES.join(', ')}

Guidance:
- exterior_front: the front facade / street view / entry approach of the home
- exterior_back: rear elevation of the home
- aerial: drone / overhead shot of the property or neighborhood
- great_room: a combined open living+kitchen or living+dining space
- primary_bedroom: the largest bedroom, usually with an en-suite or sitting area
- primary_bathroom: a large/en-suite bathroom (double vanity, soaking tub)
- powder_room: a small half-bath with just a toilet + sink
- view: a window/balcony shot whose subject is the outlook (ocean, skyline, hills)
- detail: a tight close-up of a fixture, finish, or feature (faucet, fireplace)
- other: anything that doesn't fit a category

Pick the single best fit. Use "bedroom"/"bathroom" for secondary rooms and only
use the "primary_" variants when the room is clearly the main suite.

Output strict JSON only:
{ "room_type": "<one value from the list>", "confidence": 0.0-1.0 }
`.trim();

export async function classifyRoom(bytes: Buffer): Promise<RoomClassification | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

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
            { type: 'text', text: 'Which area of the property is this?' },
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
      max_tokens: 60,
    });

    const content = result.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const roomType = normalizeRoomType(parsed.room_type);
    if (!roomType) return null;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
    return { roomType, confidence: Math.max(0, Math.min(1, confidence)) };
  } catch (err) {
    console.error('[room-classify] failed:', err);
    return null;
  }
}
