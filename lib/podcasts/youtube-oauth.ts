import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { encryptionConfigured, sealToken } from '@/lib/google-calendar/token-encryption';
import { exchangeCodeForTokens, redirectUri } from '@/lib/google-calendar/oauth';
import { YOUTUBE_SCOPE, youtubeRequest } from './youtube';
import { queueYoutubeUpload } from './youtube-upload';

export const YOUTUBE_COOKIE = 'podcast_youtube_state';
export function youtubeConfigured() {
  return Boolean(encryptionConfigured() && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}
export function youtubeConsentUrl(state: string) {
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id:process.env.GOOGLE_OAUTH_CLIENT_ID!, redirect_uri:redirectUri(), state,
    scope:YOUTUBE_SCOPE, response_type:'code', access_type:'offline', prompt:'consent', include_granted_scopes:'false',
  })}`;
}

/** Reuses the already registered Google redirect URI; calendar credentials are
 * kept separate and the calendar OAuth branch remains unchanged. */
export async function handleYoutubeCallback(request: Request) {
  const gate = await requireTeamMember();
  if (gate.error) return gate.error;
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const raw = cookieStore.get(YOUTUBE_COOKIE)?.value;
  cookieStore.delete({name:YOUTUBE_COOKIE,path:'/api/auth/google'});
  let saved: any;
  try { saved = JSON.parse(raw || 'null'); } catch { saved = null; }
  const base = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  if (!saved || saved.userId !== gate.user.id || saved.state !== url.searchParams.get('state') ||
      !/^[a-f0-9-]{36}$/.test(saved.episodeId || '')) {
    return NextResponse.redirect(`${base}/dashboard/podcasts?youtube_error=invalid_connection_state`);
  }
  const back = `${base}/dashboard/podcasts/${saved.episodeId}`;
  const fail = (message:string) => NextResponse.redirect(`${back}?youtube_error=${encodeURIComponent(message)}`);
  if (url.searchParams.has('error')) return fail('YouTube connection was not completed.');
  if (!youtubeConfigured() || !url.searchParams.get('code')) return fail('YouTube connection is not configured.');
  try {
    const tokens = await exchangeCodeForTokens(url.searchParams.get('code')!);
    if (!tokens.refresh_token || !tokens.scope.split(' ').includes(YOUTUBE_SCOPE)) return fail('YouTube permission and offline access are required.');
    const response = await youtubeRequest('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',tokens.access_token);
    if (!response.ok) return fail('Enable YouTube Data API v3 for the Ops Google project, then reconnect.');
    const channel = (await response.json()).items?.[0];
    if (!channel?.id) return fail('No YouTube channel was found. Select the account that owns this show.');
    const admin = createAdminClient() as any;
    const {data:ep,error:epError} = await admin.from('podcast_episodes').select('show_id,podcast_shows(metadata)').eq('id',saved.episodeId).single();
    if (epError || !ep || ep.show_id !== saved.showId) return fail('The episode or show changed. Reconnect from the episode page.');
    const expected = ep.podcast_shows?.metadata?.youtube_channel_id;
    if (expected && expected !== channel.id) return fail('That is a different YouTube channel. Reconnect using this show’s channel.');
    const {data:previous,error:readError} = await admin.from('podcast_youtube_connections').select('channel_id').eq('show_id',ep.show_id).maybeSingle();
    if (readError) return fail('Could not read the channel connection.');
    if (previous && previous.channel_id !== channel.id) return fail('Reconnect the same channel. Contact the studio to change a show’s destination.');
    const {error} = await admin.from('podcast_youtube_connections').upsert({show_id:ep.show_id,channel_id:channel.id,
      channel_title:channel.snippet.title, refresh_token:sealToken(tokens.refresh_token,`youtube:${ep.show_id}`,'refresh'), connected_by:gate.user.id}, {onConflict:'show_id'});
    if(error) return fail('Could not save the YouTube connection.');
    await queueYoutubeUpload(admin,saved.episodeId);
    return NextResponse.redirect(`${back}?youtube_connected=1`);
  } catch { return fail('The connection could not be completed. Reconnect to try again.'); }
}
