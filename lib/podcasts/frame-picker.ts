import OpenAI from 'openai';
import sharp from 'sharp';

/**
 * Podcast thumbnail frame picker (v1).
 *
 * Replaces the manual "drop a hosts photo / guest photo into Dropbox" step. Given
 * a permanent HOSTS IDENTITY REFERENCE (one photo of the two hosts, never
 * composited — only used to recognise who's who) and the episode's own video
 * frames, a vision model decides:
 *   - which frame is the cleanest shot of the hosts (same people, whatever they
 *     are wearing that day), and
 *   - which frame is the cleanest shot of the guest (any person NOT in the
 *     reference), and whether the guest is remote (on a screen) or in-studio.
 *
 * v1 frame source is YouTube's own auto-extracted frames (maxres1/2/3 = 25/50/75%
 * of the video). They are untouched by custom thumbnails — unlike hq720 /
 * maxresdefault, which serve OUR previous thumbnail back once one is set and
 * caused compounding errors. v2 will extract more frames from the Dropbox file.
 */

export type FrameCandidate = { index: number; url: string };

export type PickerResult = {
  hosts_frame: number | null;
  guest_frame: number | null;
  guest_remote: boolean;
  notes: string;
};

export type PickFramesOutput = PickerResult & {
  hosts_frame_url: string | null;
  guest_frame_url: string | null;
  hosts_reference_used: boolean;
  frames_considered: number;
  model: string | null;
};

/** YouTube auto-frame URLs to try, best quality first, for index 1..3. */
export function youtubeFrameCandidates(videoId: string, index: number): string[] {
  const id = encodeURIComponent(videoId);
  return [`https://i.ytimg.com/vi/${id}/maxres${index}.jpg`, `https://i.ytimg.com/vi/${id}/hq${index}.jpg`];
}

/**
 * Parse the model's JSON answer defensively. Any index outside the considered
 * frames, or anything non-numeric, is treated as "no pick" (null) so a flaky
 * answer degrades to the existing fallbacks rather than a bad thumbnail.
 */
export function parsePickerResponse(raw: unknown, frameCount: number): PickerResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= frameCount ? n : null;
  };
  return {
    hosts_frame: pick(obj.hosts_frame),
    guest_frame: pick(obj.guest_frame),
    guest_remote: obj.guest_remote === true || obj.guest_remote === 'true',
    notes: typeof obj.notes === 'string' ? obj.notes.slice(0, 500) : '',
  };
}

const SYSTEM_PROMPT = `
You are a photo editor picking source frames for a podcast YouTube thumbnail.

You receive:
1. HOSTS REFERENCE — one photo showing the show's two regular hosts. Use it ONLY
   to recognise the hosts' identities. Their clothing, hair styling, glasses and
   the background will differ from episode to episode; match on faces.
2. FRAME 1..N — frames taken from this episode's video.

Decide:
- hosts_frame: the frame number that is the cleanest shot of the HOSTS — ideally
  both hosts visible, faces clear and front-ish, eyes open, not mid-word or
  blinking, not tiny in the frame. If no frame shows the hosts acceptably, null.
- guest_frame: the frame number that is the cleanest shot of the GUEST — the
  person who is NOT in the reference. Prefer the guest large, centred, face
  clear. A frame with hosts AND guest is acceptable for guest_frame only if no
  cleaner guest-only frame exists. If no frame shows a guest, null.
- guest_remote: true if the guest appears on a screen / video call (different
  room, webcam look, screen border), false if physically in the studio.
- notes: one short sentence on what you saw.

Rules: never pick a frame for the hosts that shows only the guest. Never pick a
frame for the guest that shows only the hosts. Frame numbers refer to the FRAME
labels. Output strict JSON only:
{"hosts_frame": number|null, "guest_frame": number|null, "guest_remote": boolean, "notes": string}
`.trim();

// Current-generation vision models only: the 5-series rejects the legacy
// `max_tokens` parameter and gpt-4o is retired on this account.
const DEFAULT_MODELS = ['gpt-5.4', 'gpt-5.4-mini'];

async function shrink(bytes: Buffer): Promise<string> {
  const small = await sharp(bytes).resize({ width: 896, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return `data:image/jpeg;base64,${small.toString('base64')}`;
}

/**
 * Ask the vision model to pick frames. Returns null when OpenAI isn't
 * configured or every model attempt fails — callers fall back to their
 * existing defaults.
 */
export async function pickFramesWithVision(
  reference: Buffer | null,
  frames: { index: number; bytes: Buffer }[],
  opts: { models?: string[] } = {}
): Promise<{ result: PickerResult; model: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || frames.length === 0) return null;

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  if (reference) {
    content.push({ type: 'text', text: 'HOSTS REFERENCE (identity only):' });
    content.push({ type: 'image_url', image_url: { url: await shrink(reference), detail: 'high' } });
  } else {
    content.push({ type: 'text', text: 'No hosts reference is available: treat every person as unknown; hosts_frame must be null.' });
  }
  for (const f of frames) {
    content.push({ type: 'text', text: `FRAME ${f.index}:` });
    content.push({ type: 'image_url', image_url: { url: await shrink(f.bytes), detail: 'high' } });
  }
  content.push({ type: 'text', text: 'Pick the frames now. JSON only.' });

  const client = new OpenAI({ apiKey });
  const models = opts.models ?? (process.env.PODCAST_FRAME_PICKER_MODEL ? [process.env.PODCAST_FRAME_PICKER_MODEL] : DEFAULT_MODELS);
  let lastErr: unknown = null;
  for (const model of models) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 400,
      });
      const text = res.choices[0]?.message?.content;
      if (!text) continue;
      return { result: parsePickerResponse(JSON.parse(text), frames.length), model };
    } catch (err) {
      lastErr = err;
      console.warn(`[frame-picker] model ${model} failed, trying next:`, (err as any)?.message ?? err);
    }
  }
  console.error('[frame-picker] all models failed:', lastErr);
  return null;
}

/** Fetch a binary URL; null on non-2xx, empty body, or network error. */
export async function fetchImage(url: string, timeoutMs = 10_000): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1024 ? buf : null; // ytimg returns a tiny placeholder for missing sizes
  } catch {
    return null;
  }
}
