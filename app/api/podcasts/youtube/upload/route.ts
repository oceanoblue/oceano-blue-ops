import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createAdminClient } from '@/lib/supabase/server';
import { queueYoutubeUpload } from '@/lib/podcasts/youtube-upload';
import { youtubeConfigured } from '@/lib/podcasts/youtube-oauth';
export const dynamic = 'force-dynamic';

export async function GET(request:Request) {
  const gate=await requireTeamMember(); if(gate.error)return gate.error;
  const id=z.string().uuid().safeParse(new URL(request.url).searchParams.get('episode_id'));
  if(!id.success)return NextResponse.json({error:'invalid_episode'},{status:400});
  const admin=createAdminClient() as any;
  const {data:ep,error}=await admin.from('podcast_episodes').select('show_id,status').eq('id',id.data).maybeSingle();
  if(error||!ep)return NextResponse.json({error:'episode_not_found'},{status:404});
  const [connection,upload]=await Promise.all([
    admin.from('podcast_youtube_connections').select('channel_id,channel_title').eq('show_id',ep.show_id).maybeSingle(),
    admin.from('podcast_youtube_uploads').select('status,uploaded_bytes,total_bytes,error,privacy,youtube_id,updated_at').eq('episode_id',id.data).maybeSingle(),
  ]);
  if(connection.error||upload.error)return NextResponse.json({error:'Upload status is temporarily unavailable.'},{status:503});
  return NextResponse.json({configured:youtubeConfigured(),connection:connection.data,upload:upload.data,episode_status:ep.status});
}
export async function POST(request:Request) {
  const gate=await requireTeamMember(); if(gate.error)return gate.error;
  const body=z.object({episode_id:z.string().uuid()}).safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({error:'invalid_episode'},{status:400});
  const admin=createAdminClient() as any;
  try {
    const queued=await queueYoutubeUpload(admin,body.data.episode_id);
    if(!queued)return NextResponse.json({error:'Connect YouTube and wait for generated copy before uploading. Episodes already linked to YouTube cannot be uploaded again.'},{status:409});
    // Retry the same session; never clear its identity or reset completed work.
    const {error}=await admin.from('podcast_youtube_uploads').update({status:'queued',error:null,attempts:0,next_attempt_at:new Date().toISOString()})
      .eq('episode_id',body.data.episode_id).eq('status','failed');
    if(error)throw error;
    return NextResponse.json({ok:true});
  } catch {return NextResponse.json({error:'Could not queue the upload. Please retry.'},{status:500});}
}
