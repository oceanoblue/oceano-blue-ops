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

// Cache the short-lived access token in-process. Dropbox's /oauth2/token endpoint
// is rate-limited, so exchanging the refresh token on every call (e.g. once per
// file across a 200-file shoot) trips `token_exchange_400`. Reuse until it's near
// expiry (~4 h tokens; refresh 5 min early).
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) return cachedAccessToken.token;
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
  if (!res.ok) {
    const detail = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`token_exchange_${res.status}: ${detail}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('no_access_token');
  const ttlMs = Math.max(60, (json.expires_in ?? 14400) - 300) * 1000;
  cachedAccessToken = { token: json.access_token, expiresAt: Date.now() + ttlMs };
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
/**
 * Dropbox Business team tokens can't call user endpoints directly — they must
 * name the member to act as via `Dropbox-API-Select-User`. We detect that
 * exact 400 ("...access token you provided is for an entire Dropbox Business
 * team"), resolve the member id once (by DROPBOX_TEAM_MEMBER_EMAIL, or the
 * sole member of a one-person team), and retry.
 */
let cachedMemberId: string | null | undefined;

async function resolveTeamMemberId(token: string): Promise<string | null> {
  if (cachedMemberId !== undefined) return cachedMemberId;
  try {
    const res = await fetch('https://api.dropboxapi.com/2/team/members/list_v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    });
    if (!res.ok) {
      cachedMemberId = null;
      return null;
    }
    const json = (await res.json()) as {
      members?: { profile?: { team_member_id?: string; email?: string; status?: { '.tag'?: string } } }[];
    };
    const members = (json.members ?? [])
      .map((m) => m.profile)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.team_member_id))
      .filter((p) => (p.status?.['.tag'] ?? 'active') === 'active');
    const wanted = process.env.DROPBOX_TEAM_MEMBER_EMAIL?.toLowerCase();
    const match = wanted
      ? members.find((p) => p.email?.toLowerCase() === wanted)
      : members.length === 1
        ? members[0]
        : undefined;
    cachedMemberId = match?.team_member_id ?? null;
    return cachedMemberId;
  } catch {
    cachedMemberId = null;
    return null;
  }
}

const TEAM_TOKEN_400 = 'entire Dropbox Business team';

/** POST a user-endpoint call; on the team-token 400, retry as the resolved member. */
async function dbxUserCall(token: string, url: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const first = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (first.status !== 400) return first;

  const text = await first.clone().text();
  if (!text.includes(TEAM_TOKEN_400)) return first;

  const memberId = await resolveTeamMemberId(token);
  if (!memberId) return first;
  return fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Dropbox-API-Select-User': memberId },
    body: JSON.stringify(body),
  });
}

export async function createPhotoIntakeRequest(
  orderNumber: number,
  slug: string,
  title: string
): Promise<FileRequestResult> {
  if (!isDropboxConfigured()) return { status: 'not_configured' };
  const path = intakeFolderPath(orderNumber, slug);
  try {
    const token = await getAccessToken();

    // Folder first (409 conflict = already exists = fine). Keep Dropbox's
    // error body in the failure — the status code alone ("400") hides the
    // actual reason (malformed path vs missing_scope vs team-token rules).
    const folderRes = await dbxUserCall(
      token,
      'https://api.dropboxapi.com/2/files/create_folder_v2',
      { path, autorename: false }
    );
    if (!folderRes.ok && folderRes.status !== 409) {
      return {
        status: 'failed',
        error: `dropbox_folder_${folderRes.status}: ${await dropboxErrorDetail(folderRes)} (path: ${path})`,
      };
    }

    const reqRes = await dbxUserCall(
      token,
      'https://api.dropboxapi.com/2/file_requests/create',
      { title, destination: path, open: true }
    );
    if (!reqRes.ok) {
      return {
        status: 'failed',
        error: `dropbox_request_${reqRes.status}: ${await dropboxErrorDetail(reqRes)}`,
      };
    }
    const json = (await reqRes.json()) as { url?: string };
    if (!json.url) return { status: 'failed', error: 'no_request_url' };

    return { status: 'created', url: json.url, path };
  } catch (e: any) {
    return { status: 'failed', error: e?.message ?? 'dropbox_error' };
  }
}

// ─── Reading intake files back out (cloud processing) ────────────────────────
// The office no longer relies on Dropbox desktop-sync to a Mac: the server lists
// the per-order intake folder directly and (in the cloud worker) pulls bytes via
// a temporary link.

export type DropboxFile = {
  name: string;
  path_lower: string;
  id: string;
  size: number;
  client_modified?: string;
};

export type ListFolderResult =
  | { status: 'ok'; files: DropboxFile[] }
  | { status: 'not_found' }
  | { status: 'not_configured' }
  | { status: 'failed'; error: string };

/** List the files in a Dropbox folder (non-recursive, paginated). */
export async function listFolder(path: string): Promise<ListFolderResult> {
  if (!isDropboxConfigured()) return { status: 'not_configured' };
  try {
    const token = await getAccessToken();
    const files: DropboxFile[] = [];
    const collect = (entries: any[]) => {
      for (const e of entries ?? []) {
        if (e['.tag'] === 'file') {
          files.push({ name: e.name, path_lower: e.path_lower, id: e.id, size: e.size, client_modified: e.client_modified });
        }
      }
    };

    let res = await dbxUserCall(token, 'https://api.dropboxapi.com/2/files/list_folder', {
      path,
      recursive: false,
      limit: 2000,
    });
    if (!res.ok) {
      const detail = await dropboxErrorDetail(res);
      if (res.status === 409 && detail.includes('not_found')) return { status: 'not_found' };
      return { status: 'failed', error: `dropbox_list_${res.status}: ${detail}` };
    }
    let json = (await res.json()) as any;
    collect(json.entries);
    while (json.has_more) {
      res = await dbxUserCall(token, 'https://api.dropboxapi.com/2/files/list_folder/continue', { cursor: json.cursor });
      if (!res.ok) break;
      json = await res.json();
      collect(json.entries);
    }
    return { status: 'ok', files };
  } catch (e: any) {
    return { status: 'failed', error: e?.message ?? 'dropbox_error' };
  }
}

/**
 * A short-lived (~4 hr) direct download URL for a Dropbox file. Throws with the
 * real Dropbox reason on failure (e.g. missing_scope), so the caller's error is
 * actionable instead of a bare "temp link failed".
 */
export async function getTemporaryLink(path: string): Promise<string> {
  if (!isDropboxConfigured()) throw new Error('dropbox_not_configured');
  const token = await getAccessToken();
  const res = await dbxUserCall(token, 'https://api.dropboxapi.com/2/files/get_temporary_link', { path });
  if (!res.ok) throw new Error(`dropbox_temp_link_${res.status}: ${await dropboxErrorDetail(res)}`);
  const json = (await res.json()) as { link?: string };
  if (!json.link) throw new Error('dropbox_temp_link_no_link');
  return json.link;
}

// ─── Archival (delivered orders) ─────────────────────────────────────────────

/** The archive destination for a delivered order's intake folder. */
export function archiveIntakePath(
  intakePath: string,
  root = process.env.DROPBOX_PHOTO_INTAKE_ROOT || '/Photo Intake'
): { archiveRoot: string; dest: string } {
  const r = ('/' + root).replace(/\/+/g, '/').replace(/\/$/, '');
  const name = intakePath.split('/').filter(Boolean).pop() || 'order';
  const archiveRoot = `${r}/_Archive`;
  return { archiveRoot, dest: `${archiveRoot}/${name}` };
}

/** Create a folder (idempotent — an existing folder is fine). */
export async function ensureFolder(path: string): Promise<'ok' | 'not_configured' | 'failed'> {
  if (!isDropboxConfigured()) return 'not_configured';
  try {
    const token = await getAccessToken();
    const res = await dbxUserCall(token, 'https://api.dropboxapi.com/2/files/create_folder_v2', { path, autorename: false });
    if (res.ok || res.status === 409) return 'ok'; // 409 = already exists
    return 'failed';
  } catch {
    return 'failed';
  }
}

export type MoveResult = { status: 'moved' } | { status: 'not_found' } | { status: 'not_configured' } | { status: 'failed'; error: string };

/** Move a Dropbox path (folder or file). */
export async function movePath(fromPath: string, toPath: string): Promise<MoveResult> {
  if (!isDropboxConfigured()) return { status: 'not_configured' };
  try {
    const token = await getAccessToken();
    const res = await dbxUserCall(token, 'https://api.dropboxapi.com/2/files/move_v2', {
      from_path: fromPath,
      to_path: toPath,
      autorename: true,
    });
    if (res.ok) return { status: 'moved' };
    const detail = await dropboxErrorDetail(res);
    if (res.status === 409 && detail.includes('not_found')) return { status: 'not_found' };
    return { status: 'failed', error: `dropbox_move_${res.status}: ${detail}` };
  } catch (e: any) {
    return { status: 'failed', error: e?.message ?? 'dropbox_error' };
  }
}

/** Compact human-readable reason from a Dropbox error response. */
async function dropboxErrorDetail(res: Response): Promise<string> {
  try {
    const text = (await res.text()).slice(0, 400);
    try {
      const j = JSON.parse(text);
      return j.error_summary || j.error?.['.tag'] || text;
    } catch {
      return text;
    }
  } catch {
    return 'no_error_body';
  }
}
