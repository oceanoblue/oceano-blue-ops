/**
 * Where is this episode's delivered video? The thumbnail picker (v2) samples
 * frames from the editor's mp4, so it needs youtube_id → a way to fetch bytes.
 *
 * Chain (all written by the Make intake / youtube.uploaded callbacks):
 *   external_links(link_type='youtube_video', external_id=<youtube_id>).job_id
 *     → podcast_episodes(job_id).metadata.dropbox_path (+ .filename)
 *     → assets(job_id, asset_type='source').local_path / .filename / .external_url
 *
 * The app's Dropbox integration is an App-Folder (sandbox) app and can never
 * see the /Podcasts team folder, so `dropboxPath` alone is not enough to fetch
 * bytes in production — but Make (full-access) stores a Dropbox share link for
 * the source mp4 at intake (`assets.external_url`), and that share link needs
 * no Dropbox API at all. Callers should prefer `shareUrl` and fall back to a
 * Dropbox temporary link from `dropboxPath` only when there's no share link.
 *
 * Any missing link returns null — the caller falls back to YouTube's frames.
 */

export type EpisodeSource = {
  episodeId: string;
  jobId: string;
  dropboxPath: string | null;
  /** The source asset's `external_url` when it's an http(s) URL (a Dropbox share link), else null. */
  shareUrl: string | null;
  /** filename without extension, lower-cased — same as the Make scenario's `ref_base` */
  basename: string;
};

export function episodeBasename(filename: string): string {
  return filename
    .trim()
    .replace(/^.*[\\/]/, '')
    .replace(/\.(mp4|mov|m4v)$/i, '')
    .trim()
    .toLowerCase();
}

/**
 * Normalise a Dropbox share link into a plain downloadable URL by forcing
 * `dl=1`. Returns null unless `shareUrl` parses as an `https:` URL on a
 * Dropbox host (www.dropbox.com, dropbox.com, or *.dropboxusercontent.com).
 */
export function directDownloadUrl(shareUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(shareUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  const isDropboxHost = host === 'www.dropbox.com' || host === 'dropbox.com' || host.endsWith('.dropboxusercontent.com');
  if (!isDropboxHost) return null;
  u.searchParams.set('dl', '1');
  return u.toString();
}

function basenameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ?? null;
  } catch {
    return null;
  }
}

// `admin` is the service-role client; typed loosely like the other automation routes.
export async function resolveEpisodeSource(admin: any, youtubeId: string): Promise<EpisodeSource | null> {
  try {
    const { data: link } = await admin
      .from('external_links')
      .select('job_id')
      .eq('link_type', 'youtube_video')
      .eq('external_id', youtubeId)
      .limit(1)
      .maybeSingle();
    if (!link?.job_id) return null;

    const { data: ep } = await admin
      .from('podcast_episodes')
      .select('id, job_id, metadata')
      .eq('job_id', link.job_id)
      .limit(1)
      .maybeSingle();
    if (!ep) return null;

    const meta = (ep.metadata ?? {}) as Record<string, unknown>;
    let dropboxPath = typeof meta.dropbox_path === 'string' && meta.dropbox_path ? meta.dropbox_path : null;
    let filename = typeof meta.filename === 'string' && meta.filename ? meta.filename : null;

    const { data: asset } = await admin
      .from('assets')
      .select('local_path, filename, external_url')
      .eq('job_id', link.job_id)
      .eq('asset_type', 'source')
      .limit(1)
      .maybeSingle();

    dropboxPath = dropboxPath ?? asset?.local_path ?? null;
    filename = filename ?? asset?.filename ?? null;
    const shareUrl = typeof asset?.external_url === 'string' && /^https?:\/\//i.test(asset.external_url) ? asset.external_url : null;

    if (!dropboxPath && !shareUrl) return null;

    const basename = episodeBasename(filename ?? dropboxPath ?? (shareUrl ? basenameFromUrl(shareUrl) ?? '' : ''));
    if (!basename) return null;
    return { episodeId: ep.id, jobId: ep.job_id, dropboxPath, shareUrl, basename };
  } catch {
    return null;
  }
}
