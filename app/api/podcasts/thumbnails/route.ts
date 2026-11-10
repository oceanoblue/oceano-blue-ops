import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const gate=await requireTeamMember(); if(gate.error)return gate.error;
  const id=z.string().uuid().safeParse(new URL(request.url).searchParams.get('episode_id'));
  if(!id.success)return NextResponse.json({error:'Invalid episode.'},{status:400});
  const admin=createAdminClient() as any;
  const {data,error}=await admin.from('podcast_thumbnails').select('status,error,storage_path,updated_at').eq('episode_id',id.data).maybeSingle();
  if(error)return NextResponse.json({error:'Thumbnail status unavailable.'},{status:503});
  let previewUrl:string|null=null;
  if(data?.status==='ready' && data.storage_path) {
    const signed=await admin.storage.from('thumbnails').createSignedUrl(data.storage_path,3600);
    previewUrl=signed.data?.signedUrl ?? null;
  }
  return NextResponse.json({thumbnail:data?{status:data.status,error:data.error,updated_at:data.updated_at}:null,preview_url:previewUrl});
}
export async function POST(request: Request) {
  const gate=await requireTeamMember(); if(gate.error)return gate.error;
  const body=z.object({episode_id:z.string().uuid()}).safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({error:'Invalid episode.'},{status:400});
  const admin=createAdminClient() as any;
  const {data:ep}=await admin.from('podcast_episodes').select('status').eq('id',body.data.episode_id).maybeSingle();
  if(!ep || ['cancelled','archived','needs_revision'].includes(ep.status))return NextResponse.json({error:'Episode unavailable.'},{status:409});
  const {data,error}=await admin.from('podcast_thumbnails').update({status:'queued',attempts:0,error:null,lease_token:null,lease_expires_at:null,updated_at:new Date().toISOString()})
    .eq('episode_id',body.data.episode_id).eq('status','failed').select('episode_id');
  if(error || !data?.length)return NextResponse.json({error:'Only failed thumbnails can be retried.'},{status:409});
  return NextResponse.json({ok:true});
}
