import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createAdminClient } from '@/lib/supabase/server';
import { YOUTUBE_COOKIE, youtubeConfigured, youtubeConsentUrl } from '@/lib/podcasts/youtube-oauth';
export async function GET(request: Request) {
  const gate = await requireTeamMember();
  if(gate.error) return gate.error;
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get('episode_id'));
  if(!id.success) return NextResponse.json({error:'invalid_episode'}, {status:400});
  if(!youtubeConfigured()) return NextResponse.json({error:'YouTube connection needs the studio’s Google integration configured.'},{status:503});
  const {data:ep,error} = await (createAdminClient() as any).from('podcast_episodes').select('show_id').eq('id',id.data).maybeSingle();
  if(error || !ep) return NextResponse.json({error:'episode_not_found'},{status:404});
  const state = `youtube.${randomBytes(32).toString('hex')}`;
  const response = NextResponse.redirect(youtubeConsentUrl(state));
  response.cookies.set(YOUTUBE_COOKIE, JSON.stringify({state,userId:gate.user.id,showId:ep.show_id,episodeId:id.data}),
    {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:600,path:'/api/auth/google'});
  return response;
}
