/**
 * Transistor.fm integration — audio podcast distribution (Spotify/Apple pull
 * from Transistor's RSS, so this is the only audio API POS needs).
 *
 * Env: TRANSISTOR_API_KEY. Everything degrades gracefully when unset.
 * The pipeline (Make) uploads the audio + creates the DRAFT episode; POS only
 * lists shows (for the picker) and PUBLISHES the draft on approval — the same
 * human-gate split as YouTube.
 */
const API = 'https://api.transistor.fm/v1';

export function isTransistorConfigured(): boolean {
  return Boolean(process.env.TRANSISTOR_API_KEY);
}

function headers() {
  return { 'x-api-key': process.env.TRANSISTOR_API_KEY!, 'Content-Type': 'application/json' };
}

export type TransistorShow = { id: string; title: string };

export async function listTransistorShows(): Promise<TransistorShow[] | null> {
  if (!isTransistorConfigured()) return null;
  const res = await fetch(`${API}/shows`, { headers: headers() });
  if (!res.ok) throw new Error(`transistor_${res.status}`);
  const json = (await res.json()) as { data?: Array<{ id: string; attributes?: { title?: string } }> };
  return (json.data ?? []).map((s) => ({ id: s.id, title: s.attributes?.title ?? s.id }));
}

export type TransistorPublishResult =
  | { status: 'published'; episode_id: string }
  | { status: 'not_configured' }
  | { status: 'failed'; error: string };

/** Publish a draft episode (created earlier by the pipeline). Idempotent-ish: re-publishing a published episode is a no-op server-side. */
export async function publishTransistorEpisode(episodeId: string): Promise<TransistorPublishResult> {
  if (!isTransistorConfigured()) return { status: 'not_configured' };
  try {
    const res = await fetch(`${API}/episodes/${encodeURIComponent(episodeId)}/publish`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ episode: { status: 'published' } }),
    });
    if (!res.ok) return { status: 'failed', error: `transistor_${res.status}` };
    return { status: 'published', episode_id: episodeId };
  } catch (e: any) {
    return { status: 'failed', error: e?.message ?? 'transistor_error' };
  }
}
