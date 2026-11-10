import { openToken } from '@/lib/google-calendar/token-encryption';
import { refreshAccessToken } from '@/lib/google-calendar/oauth';

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';
export const CHUNK_SIZE = 32 * 1024 * 1024;

export function uploadSessionUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' ||
      url.pathname !== '/upload/youtube/v3/videos' || !url.searchParams.has('upload_id')) {
    throw new Error('YouTube returned an invalid upload session.');
  }
  return url.toString();
}

export function uploadedOffset(range: string | null, total: number): number {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  const offset = match ? Number(match[1]) + 1 : NaN;
  if (!Number.isSafeInteger(offset) || offset < 1 || offset > total) throw new Error('Invalid YouTube upload progress.');
  return offset;
}

export function videoMetadata(copy: any, fallback: string) {
  const title = String(copy?.title || fallback).replace(/[<>]/g, '').slice(0, 100);
  let description = String(copy?.youtube_description || '').replace(/\\n/g, '\n').replace(/[<>]/g, '');
  while (Buffer.byteLength(description, 'utf8') > 4900) description = description.slice(0, -1);
  const tags: string[] = [];
  for (const value of Array.isArray(copy?.tags) ? copy.tags : []) {
    if (typeof value !== 'string') continue;
    const tag = value.trim().slice(0, 80);
    if (tag && [...tags, tag].join(',').length <= 400) tags.push(tag);
  }
  return { snippet: { title, description, tags, categoryId: '22' }, status: { privacyStatus: 'unlisted' } };
}

export async function youtubeToken(admin: any, showId: string) {
  const { data, error } = await admin.from('podcast_youtube_connections').select('channel_id,refresh_token').eq('show_id', showId).maybeSingle();
  if (error || !data) throw new Error('Connect this show’s YouTube channel to upload.');
  const tokens = await refreshAccessToken(openToken(data.refresh_token, `youtube:${showId}`, 'refresh'));
  return { token: tokens.access_token, channelId: data.channel_id as string };
}

export async function youtubeRequest(url: string, token: string, init: RequestInit = {}) {
  // YouTube uses HTTP 308 for resumable-upload progress. `error` rejects
  // that response before the uploader can read it. `manual` exposes it
  // without following redirects or forwarding credentials to another URL.
  return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` },
    redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(60000) });
}

export async function publishYoutubeDraft(admin: any, showId: string, videoId: string) {
  const { token, channelId } = await youtubeToken(admin, showId);
  const current = await youtubeRequest(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`, token);
  if (!current.ok) throw new Error(`YouTube could not verify this video (${current.status}).`);
  const video = (await current.json()).items?.[0];
  if (!video || video.snippet.channelId !== channelId) throw new Error('This video does not belong to the connected show channel.');
  const response = await youtubeRequest('https://www.googleapis.com/youtube/v3/videos?part=status', token, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: videoId, status: { privacyStatus: 'public', embeddable:video.status.embeddable, license:video.status.license, selfDeclaredMadeForKids:video.status.selfDeclaredMadeForKids } }),
  });
  if (!response.ok || (await response.json()).status?.privacyStatus !== 'public') {
    throw new Error('YouTube did not confirm publication. Check the channel’s API upload restrictions and retry.');
  }
}
