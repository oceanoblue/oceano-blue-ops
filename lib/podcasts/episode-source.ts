/**
 * Where is this episode's delivered video? The thumbnail picker (v2) samples
 * frames from the editor's mp4 in Dropbox, so it needs youtube_id → file path.
 *
 * Chain (all written by the Make intake / youtube.uploaded callbacks):
 *   external_links(link_type='youtube_video', external_id=<youtube_id>).job_id
 *     → podcast_episodes(job_id).metadata.dropbox_path (+ .filename)
 *     → fallback: assets(job_id, asset_type='source').local_path
 * Any missing link returns null — the caller falls back to YouTube's frames.
 */

export type EpisodeSource = {
  episodeId: string;
  jobId: string;
  dropboxPath: string;
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

    if (!dropboxPath) {
      const { data: asset } = await admin
        .from('assets')
        .select('local_path, filename')
        .eq('job_id', link.job_id)
        .eq('asset_type', 'source')
        .limit(1)
        .maybeSingle();
      dropboxPath = asset?.local_path ?? null;
      filename = filename ?? asset?.filename ?? null;
    }
    if (!dropboxPath) return null;

    const basename = episodeBasename(filename ?? dropboxPath);
    if (!basename) return null;
    return { episodeId: ep.id, jobId: ep.job_id, dropboxPath, basename };
  } catch {
    return null;
  }
}
