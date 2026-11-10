import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { openToken, sealToken } from '@/lib/google-calendar/token-encryption';
import { directDownloadUrl } from './episode-source';
import { CHUNK_SIZE, uploadedOffset, uploadSessionUrl, videoMetadata, youtubeRequest, youtubeToken } from './youtube';

function check(result: any) {
  if (result.error) throw new Error('Could not save upload progress. Please retry.');
  return result.data;
}

export async function queueYoutubeUpload(admin: any, episodeId: string) {
  const ep = check(await admin.from('podcast_episodes').select('id,show_id,job_id,status,metadata').eq('id', episodeId).maybeSingle());
  if (!ep?.job_id || !ep.metadata?.copy?.title || !['needs_review', 'transcribed'].includes(ep.status)) return false;
  const connection = check(await admin.from('podcast_youtube_connections').select('show_id').eq('show_id', ep.show_id).maybeSingle());
  if (!connection) return false;
  const link = check(await admin.from('external_links').select('id').eq('job_id', ep.job_id).eq('link_type', 'youtube_video').limit(1));
  if (link?.length) return false;
  check(await admin.from('podcast_youtube_uploads').upsert({ episode_id: ep.id }, { onConflict: 'episode_id', ignoreDuplicates: true }));
  return true;
}

/** Dropbox redirects stay on Dropbox-owned HTTPS hosts, with no auth forwarding. */
export async function sourceRange(source: string, start: number, end: number) {
  // The sharing-page endpoint can fail on repeated range requests. Use
  // Dropbox's file endpoint for modern share links, retaining the same key.
  const sourceUrl = new URL(source);
  if (['dropbox.com','www.dropbox.com'].includes(sourceUrl.hostname) && sourceUrl.pathname.startsWith('/scl/fi/')) {
    sourceUrl.hostname = 'dl.dropboxusercontent.com';
  }
  let url = sourceUrl.toString();
  for (let redirect = 0; redirect < 8; redirect++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !(parsed.hostname === 'dropbox.com' || parsed.hostname.endsWith('.dropbox.com') || parsed.hostname.endsWith('.dropboxusercontent.com'))) {
      throw new Error('The episode source must be a Dropbox video link.');
    }
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity' },
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(60000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Dropbox returned an invalid redirect.');
      url = new URL(location, url).toString();
      continue;
    }
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
    if (response.status !== 206 || !range || Number(range[1]) !== start ||
      Number(range[2]) !== end || Number(range[3]) <= end) {
      await response.body?.cancel();
      throw new Error('Dropbox could not provide the requested video bytes. Check the original file and sharing link.');
    }
    return { response, total: Number(range[3]), etag: response.headers.get('etag') };
  }
  throw new Error('Dropbox returned too many redirects.');
}

export async function readBounded(response: Response, expected: number) {
  if (expected > CHUNK_SIZE || expected < 1) throw new Error('Invalid upload chunk size.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Dropbox returned an empty video.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > expected) throw new Error('Dropbox returned more data than requested.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (size !== expected) throw new Error('Dropbox transfer was interrupted.');
  return Buffer.concat(chunks, size);
}

export async function runYoutubeUpload() {
  const admin = createAdminClient() as any;
  const lease = randomUUID();
  const rows = check(await admin.rpc('claim_podcast_youtube_upload', { p_lease: lease }));
  const task = rows?.[0];
  if (!task) return { status: 'idle' };
  const started = Date.now();
  const save = async (patch: any) => {
    const rows = check(await admin.from('podcast_youtube_uploads').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('episode_id', task.episode_id).eq('lease_id', lease).select('episode_id'));
    if (!rows?.length) throw new Error('Upload lease expired.');
    Object.assign(task, patch);
  };
  try {
    const ep = check(await admin.from('podcast_episodes').select('id,show_id,job_id,title,status,metadata').eq('id', task.episode_id).single());
    if (['cancelled','archived','needs_revision'].includes(ep.status)) throw new Error('This episode is paused or awaiting revisions.');
    const finish = async (id: string, privacy: string) => {
      check(await admin.rpc('record_podcast_youtube_upload', { p_episode: ep.id, p_video: id, p_privacy: privacy }));
      return { status: 'uploaded', episode_id: ep.id };
    };
    if (task.youtube_id) return await finish(task.youtube_id, task.privacy);
    // A manual upload or Make callback may have completed before the queue ran.
    const links = check(await admin.from('external_links').select('external_id,label').eq('job_id',ep.job_id).eq('link_type','youtube_video').limit(1));
    if (links?.length) {
      await save({ status: 'failed', error: 'A YouTube video is already linked. Review that video instead of uploading a duplicate.', lease_id: null, lease_until: null });
      return { status: 'already_linked' };
    }
    const { token, channelId } = await youtubeToken(admin, ep.show_id);
    if (!task.source_url) {
      const assets = check(await admin.from('assets').select('external_url').eq('job_id',ep.job_id).eq('asset_type','source').limit(1));
      const source = assets?.[0]?.external_url && directDownloadUrl(assets[0].external_url);
      if (!source) throw new Error('The original video is missing its Dropbox download link.');
      const first = await sourceRange(source, 0, 0);
      await readBounded(first.response, 1);
      if (!Number.isSafeInteger(first.total) || first.total < 1) throw new Error('Invalid video size.');
      await save({ source_url: source, total_bytes: first.total, source_etag: first.etag });
    }
    if (!task.session_url) {
      const response = await youtubeRequest('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', token, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(task.total_bytes), 'X-Upload-Content-Type': 'video/mp4' },
        body: JSON.stringify(videoMetadata(ep.metadata.copy, ep.title)),
      });
      if (!response.ok) {
        const reason = (await response.json().catch(() => ({}))).error?.errors?.[0]?.reason;
        throw new Error(`YouTube could not start the upload (${response.status}${typeof reason === 'string' ? `, ${reason.replace(/[^a-zA-Z0-9_]/g,'')}` : ''}). Check the channel connection and YouTube Data API access.`);
      }
      const session = uploadSessionUrl(response.headers.get('location') || '');
      await save({ session_url: sealToken(session, `youtube-upload:${ep.id}`, 'access'), status: 'uploading' });
    }
    const session = uploadSessionUrl(openToken(task.session_url, `youtube-upload:${ep.id}`, 'access'));
    let response = await youtubeRequest(session, token, { method: 'PUT', headers: { 'Content-Length':'0', 'Content-Range':`bytes */${task.total_bytes}` } });
    while (true) {
      if (response.status === 200 || response.status === 201) {
        const video = await response.json();
        if (!/^[A-Za-z0-9_-]{11}$/.test(video.id || '') || video.snippet?.channelId !== channelId || !['private','unlisted'].includes(video.status?.privacyStatus)) {
          throw new Error('YouTube returned an unexpected channel or visibility. Review this upload in YouTube Studio.');
        }
        // Persist identity before completing the review records; a DB retry must
        // never create a second YouTube upload after the last chunk succeeded.
        await save({ youtube_id: video.id, privacy: video.status.privacyStatus });
        return await finish(video.id, video.status.privacyStatus);
      }
      if (response.status === 404 || response.status === 410) {
        await save({ session_url:null, uploaded_bytes:0 });
        throw new Error('The resumable upload expired. Retry to start a fresh upload.');
      }
      if (response.status !== 308) throw new Error(`YouTube paused the upload (${response.status}). It will resume from the last confirmed byte.`);
      const offset = uploadedOffset(response.headers.get('range'), Number(task.total_bytes));
      await save({ uploaded_bytes:offset, status:'uploading', error:null, attempts:offset > Number(task.uploaded_bytes) ? 0 : task.attempts });
      if (Date.now() - started > 120000 || response.headers.has('retry-after')) {
        const retry = Number(response.headers.get('retry-after')) || 60;
        await save({ lease_id:null, lease_until:null, next_attempt_at:new Date(Date.now()+Math.min(Math.max(retry,60),3600)*1000).toISOString() });
        return { status:'uploading', episode_id:ep.id };
      }
      if (offset >= Number(task.total_bytes)) throw new Error('YouTube has all bytes but has not confirmed the video. Retry to check completion.');
      const end = Math.min(offset + CHUNK_SIZE, Number(task.total_bytes)) - 1;
      const chunk = await sourceRange(task.source_url, offset, end);
      if (chunk.total !== Number(task.total_bytes) || (task.source_etag && chunk.etag !== task.source_etag)) {
        await chunk.response.body?.cancel();
        throw new Error('The source video changed during upload. Restore the original file before retrying.');
      }
      const bytes = await readBounded(chunk.response, end-offset+1);
      response = await youtubeRequest(session, token, { method:'PUT', headers:{ 'Content-Type':'video/mp4', 'Content-Length':String(bytes.length), 'Content-Range':`bytes ${offset}-${end}/${task.total_bytes}` }, body:bytes });
    }
  } catch (error) {
    // Never store provider response bodies, access tokens, or upload URLs in errors.
    const message = error instanceof Error && !/https?:|gcm1:|Bearer /i.test(error.message) ? error.message : 'Upload interrupted. Retry to resume.';
    const attempts = Number(task.attempts) + 1;
    await save({ status:attempts>=5?'failed':task.status, error:message, attempts,
      next_attempt_at:new Date(Date.now()+Math.min(60*2**attempts,3600)*1000).toISOString(), lease_id:null, lease_until:null });
    return { status: attempts>=5?'failed':'retrying', episode_id:task.episode_id };
  }
}
