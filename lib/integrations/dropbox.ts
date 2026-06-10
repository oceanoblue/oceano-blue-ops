/**
 * Dropbox integration for auto-provisioning per-show folders (Phase B).
 *
 * POS holds its OWN Dropbox app credentials (separate from Make's connection).
 * Dropbox access tokens are short-lived, so we store a long-lived REFRESH token
 * + app key/secret and exchange for a short-lived access token per call:
 *   DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN
 *   DROPBOX_PODCAST_ROOT (optional, default "/Podcasts")
 *
 * Everything is best-effort: if the app isn't configured the caller still
 * succeeds and reports `not_configured`, mirroring the Make publish webhook.
 */

export type DropboxResult =
  | { status: 'created'; path: string }
  | { status: 'exists'; path: string }
  | { status: 'not_configured' }
  | { status: 'failed'; error: string };

export function isDropboxConfigured(): boolean {
  return Boolean(
    process.env.DROPBOX_APP_KEY &&
      process.env.DROPBOX_APP_SECRET &&
      process.env.DROPBOX_REFRESH_TOKEN
  );
}

/** Join the configured root with a show slug into a clean Dropbox path. */
export function showFolderPath(slug: string, root = process.env.DROPBOX_PODCAST_ROOT || '/Podcasts'): string {
  const r = ('/' + root).replace(/\/+/g, '/').replace(/\/$/, '');
  const s = slug.replace(/^\/+|\/+$/g, '');
  return `${r}/${s}`;
}

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.DROPBOX_REFRESH_TOKEN!,
  });
  const auth = Buffer.from(`${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`).toString('base64');
  const res = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`token_exchange_${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('no_access_token');
  return json.access_token;
}

/**
 * Create the folder for a show. Idempotent: an existing folder (409
 * path/conflict) is reported as `exists`, not an error.
 */
export async function createShowFolder(slug: string): Promise<DropboxResult> {
  if (!isDropboxConfigured()) return { status: 'not_configured' };
  const path = showFolderPath(slug);
  try {
    const token = await getAccessToken();
    const res = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, autorename: false }),
    });
    if (res.ok) return { status: 'created', path };

    // Already-exists is a success for our purposes.
    const text = await res.text();
    if (res.status === 409 && text.includes('conflict')) return { status: 'exists', path };
    return { status: 'failed', error: `dropbox_${res.status}` };
  } catch (e: any) {
    return { status: 'failed', error: e?.message ?? 'dropbox_error' };
  }
}
