import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createAdminClient } from '@/lib/supabase/server';
import { applyYoutubeThumbnail, thumbnailJpeg } from '@/lib/podcasts/thumbnail';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
export async function GET(request: Request) {
  const gate=await requireTeamMember(); if(gate.error)return gate.error;
  const id=z.string().uuid().safeParse(new URL(request.url).searchParams.get('episode_id'));
  if(!id.success)return NextResponse.json({error:'Invalid episode.'},{status:400});
  const admin=createAdminClient() as any;
  const {data,error}=await admin.from('podcast_thumbnails').select('status,error,storage_path,updated_at,lease_expires_at').eq('episode_id',id.data).maybeSingle();
  if(error)return NextResponse.json({error:'Thumbnail status unavailable.'},{status:503});
  let previewUrl:string|null=null;
  if(data?.storage_path && ['ready','review','applying'].includes(data.status)) {
    const signed=await admin.storage.from('thumbnails').createSignedUrl(data.storage_path,3600);
    previewUrl=signed.data?.signedUrl ?? null;
  }
  const status=data?.status==='applying' && Date.parse(data.lease_expires_at)<Date.now()?'review':data?.status;
  return NextResponse.json({thumbnail:data?{status,error:data.error,updated_at:data.updated_at}:null,preview_url:previewUrl});
}
export async function POST(request: Request) {
  const gate=await requireTeamMember(); if(gate.error)return gate.error;
  const multipart=request.headers.get('content-type')?.includes('multipart/form-data');
  let file:File|null=null;
  let raw:unknown;
  if(multipart){
    if(Number(request.headers.get('content-length')||0)>4_000_000)return NextResponse.json({error:'Use an image under 3 MB.'},{status:413});
    const form=await request.formData(); const item=form.get('image');file=item instanceof File?item:null;
    raw={episode_id:form.get('episode_id'),action:'upload'};
  }else raw=await request.json().catch(()=>null);
  const parsed=z.object({episode_id:z.string().uuid(),action:z.enum(['retry','approve','upload']).default('retry')}).safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:'Invalid episode.'},{status:400});
  const {episode_id:id,action}=parsed.data;
  const admin=createAdminClient() as any;
  const {data:ep}=await admin.from('podcast_episodes').select('status,show_id,job_id').eq('id',id).maybeSingle();
  if(!ep || ['cancelled','archived','needs_revision'].includes(ep.status))return NextResponse.json({error:'Episode unavailable.'},{status:409});
  const {data:link}=await admin.from('external_links').select('external_id').eq('job_id',ep.job_id).eq('link_type','youtube_video').maybeSingle();
  if(!/^[A-Za-z0-9_-]{11}$/.test(link?.external_id||''))return NextResponse.json({error:'YouTube video unavailable.'},{status:409});
  // Recovery preserves the reviewed draft; never sends it back through AI automatically.
  await admin.from('podcast_thumbnails').update({status:'review',lease_expires_at:null}).eq('episode_id',id).eq('status','applying').lt('lease_expires_at',new Date().toISOString());
  if(action==='retry'){
    const {data,error}=await admin.from('podcast_thumbnails').update({status:'queued',attempts:0,error:null,lease_token:null,lease_expires_at:null,updated_at:new Date().toISOString()}).eq('episode_id',id).in('status',['failed','review']).select('episode_id');
    if(error || !data?.length)return NextResponse.json({error:'Only failed thumbnails or drafts can be regenerated.'},{status:409});
    return NextResponse.json({ok:true});
  }
  if(action==='upload'){
    if(!file || file.size>3_000_000 || !file.size)return NextResponse.json({error:'Choose an image under 3 MB.'},{status:400});
    try{
      const bytes=await thumbnailJpeg(Buffer.from(await file.arrayBuffer()).toString('base64'));
      const path=`podcasts/${id}/${randomUUID()}.jpg`;
      const saved=await admin.storage.from('thumbnails').upload(path,bytes,{contentType:'image/jpeg'});
      if(saved.error)throw new Error('Could not save image.');
      const {data:existing}=await admin.from('podcast_thumbnails').select('status').eq('episode_id',id).maybeSingle();
      const values={youtube_id:link.external_id,status:'review',storage_path:path,error:null,lease_token:null,lease_expires_at:null,updated_at:new Date().toISOString()};
      const changed=existing?await admin.from('podcast_thumbnails').update(values).eq('episode_id',id).in('status',['ready','failed','review','queued']).select('episode_id'):await admin.from('podcast_thumbnails').insert({episode_id:id,...values}).select('episode_id');
      if(changed.error || !changed.data?.length)throw new Error('Thumbnail is busy. Try again after it finishes.');
      return NextResponse.json({ok:true});
    }catch(err){return NextResponse.json({error:err instanceof Error?err.message:'Upload failed.'},{status:400});}
  }
  const lease=randomUUID();
  const {data:task,error}=await admin.from('podcast_thumbnails').update({status:'applying',lease_token:lease,lease_expires_at:new Date(Date.now()+5*60_000).toISOString(),error:null}).eq('episode_id',id).eq('youtube_id',link.external_id).eq('status','review').select('storage_path').maybeSingle();
  if(error || !task?.storage_path)return NextResponse.json({error:'No draft available to approve.'},{status:409});
  try{
    const stored=await admin.storage.from('thumbnails').download(task.storage_path);
    if(stored.error || !stored.data)throw new Error('Could not load the reviewed thumbnail.');
    await applyYoutubeThumbnail(admin,ep.show_id,link.external_id,Buffer.from(await stored.data.arrayBuffer()));
    const complete=await admin.rpc('complete_podcast_thumbnail',{p_episode:id,p_lease:lease,p_path:task.storage_path});
    if(complete.error)throw new Error('Could not confirm completion. Please retry approval.');
    return NextResponse.json({ok:true});
  }catch(err){
    const message=err instanceof Error?err.message:'Could not apply thumbnail.';
    await admin.from('podcast_thumbnails').update({status:'review',error:message,lease_expires_at:null}).eq('episode_id',id).eq('lease_token',lease).eq('status','applying');
    return NextResponse.json({error:message},{status:502});
  }
}
