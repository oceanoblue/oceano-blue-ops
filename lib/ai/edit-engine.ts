/**
 * Client for the Oceano Edit Engine — the deterministic Python photo pipeline
 * (Fly worker). It does faithful exposure fusion + finishing grade; no pixels
 * are ever synthesized. Falls back to the in-process JS pipeline when the engine
 * isn't configured (so deploys are safe before the worker exists).
 */

export interface EditInput {
  bytes: Buffer;
  filename: string;
}

export function editEngineConfigured(): boolean {
  return Boolean(process.env.EDIT_ENGINE_URL && process.env.EDIT_WORKER_SECRET);
}

/**
 * Run the edit engine.
 *  - mode 'fuse'  → Mertens exposure fusion of a bracket into one base image.
 *  - mode 'grade' → faithful finishing grade on a single frame / fused base.
 *  - mode 'look'  → transfer the global grade of inputs[1] (a styled reference,
 *    e.g. a low-res GPT Image render) onto inputs[0] (the native original) —
 *    native-resolution output, zero synthesized pixels.
 * Returns the resulting JPEG bytes.
 */
export async function runEditEngine(
  inputs: EditInput[],
  opts: {
    mode: 'fuse' | 'grade' | 'look';
    targetLongEdge?: number;
    quality?: number;
    style?: string;
    // Real-estate enhancements (engine P1–P4). Only sent when set, so the
    // engine's conservative defaults apply otherwise.
    windowPull?: boolean; // fuse: recover blown windows from the darkest bracket
    straighten?: boolean; // de-skew + bounded keystone so verticals are plumb
    skyMode?: 'keep' | 'replace';
  }
): Promise<Buffer> {
  const url = process.env.EDIT_ENGINE_URL;
  const secret = process.env.EDIT_WORKER_SECRET;
  if (!url || !secret) throw new Error('edit_engine_not_configured');

  const form = new FormData();
  for (const i of inputs) {
    form.append('files', new Blob([new Uint8Array(i.bytes)], { type: 'image/jpeg' }), i.filename);
  }
  form.append('mode', opts.mode);
  form.append('target_long_edge', String(opts.targetLongEdge ?? 4000));
  form.append('quality', String(opts.quality ?? 90));
  form.append('style', opts.style ?? 'default');
  if (opts.windowPull) form.append('window_pull', 'true');
  if (opts.straighten) form.append('straighten', 'true');
  if (opts.skyMode) form.append('sky_mode', opts.skyMode);

  const r = await fetch(`${url.replace(/\/$/, '')}/edit`, {
    method: 'POST',
    headers: { 'x-edit-secret': secret },
    body: form,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`edit_engine_${r.status}: ${body.slice(0, 200)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

export interface ExtractedFrame {
  index: number; // 1-based position in the sampled sequence (earliest = 1)
  t: number; // seconds into the video
  bytes: Buffer; // JPEG
}

/**
 * Sample frames from a video URL via the engine's `/frames` endpoint (ffmpeg
 * on the worker; the file is range-read, never fully downloaded). Used by the
 * podcast thumbnail picker. Throws like runEditEngine; callers should check
 * editEngineConfigured() first and treat any throw as "use the fallback".
 */
export async function extractFrames(
  url: string,
  opts: { count?: number; longEdge?: number; timeoutMs?: number } = {}
): Promise<{ duration: number; frames: ExtractedFrame[] }> {
  const base = process.env.EDIT_ENGINE_URL;
  const secret = process.env.EDIT_WORKER_SECRET;
  if (!base || !secret) throw new Error('edit_engine_not_configured');

  const r = await fetch(`${base.replace(/\/$/, '')}/frames`, {
    method: 'POST',
    headers: { 'x-edit-secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, count: opts.count ?? 12, long_edge: opts.longEdge ?? 1280 }),
    // Worker worst case ≈ 30 s probe + 150 s extraction; leave headroom for a cold Fly machine.
    signal: AbortSignal.timeout(opts.timeoutMs ?? 190_000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`edit_engine_${r.status}: ${body.slice(0, 200)}`);
  }
  const json = (await r.json()) as { duration: number; frames?: { index: number; t: number; jpeg_b64: string }[] };
  return {
    duration: json.duration,
    frames: (json.frames ?? []).map((f) => ({ index: f.index, t: f.t, bytes: Buffer.from(f.jpeg_b64, 'base64') })),
  };
}
