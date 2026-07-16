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

// ─── Photo intake (contractor RAW upload) ────────────────────────────────────
// A Dropbox FILE REQUEST gives a contractor a plain upload link — no Dropbox
// account, no login, no access to anything else in the account. Files land in
// a per-order folder under DROPBOX_PHOTO_INTAKE_ROOT (default "/Photo Intake"),
// which the Dropbox desktop app syncs to the office Mac.

export type FileRequestResult =
  | { status: 'created'; url: string; path: string }
  | { status: 'not_configured' }
  | { status: 'failed'; error: string };

/** Per-order intake folder: /Photo Intake/ob{order}-{slug} */
export function intakeFolderPath(
  orderNumber: number,
  slug: string,
  root = process.env.DROPBOX_PHOTO_INTAKE_ROOT || '/Photo Intake'
): string {
  const r = ('/' + root).replace(/\/+/g, '/').replace(/\/$/, '');
  const s = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${r}/ob${orderNumber}${s ? `-${s}` : ''}`;
}

/**
 * Create the intake folder + file request for an order. Idempotent enough for
 * a retry: an existing folder is fine; Dropbox allows multiple file requests
 * to the same destination, so callers should persist the returned URL and not
 * re-create once one exists.
 */
export async function createPhotoIntakeRequest(
  orderNumber: number,
  slug: string,
  title: string
): Promise<FileRequestResult> {
  if (!isDropboxConfigured()) return { status: 'not_configured' };
  const path = intakeFolderPath(orderNumber, slug);
  try {
    const token = await getAccessToken();

    // Folder first (409 conflict = already exists = fine).
    const folderRes = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, autorename: false }),
    });
    if (!folderRes.ok && folderRes.status !== 409) {
      return { status: 'failed', error: `dropbox_folder_${folderRes.status}` };
    }

    const reqRes = await fetch('https://api.dropboxapi.com/2/file_requests/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, destination: path, open: true }),
    });
    if (!reqRes.ok) return { status: 'failed', error: `dropbox_request_${reqRes.status}` };
    const json = (await reqRes.json()) as { url?: string };
    if (!json.url) return { status: 'failed', error: 'no_request_url' };

    return { status: 'created', url: json.url, path };
  } catch (e: any) {
    return { status: 'failed', error: e?.message ?? 'dropbox_error' };
  }
}
