import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { designedThumbnail } from '@/lib/podcasts/designed-thumbnail';
import { loadThumbnailPhoto } from '@/lib/podcasts/photo-thumbnail';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim'), show_slug: z.literal('mind-your-health') }),
  z.object({ action: z.literal('complete'), episode_id: z.string().uuid(), lease_token: z.string().uuid(), source_mode: z.literal('original_photos'), hosts_url: z.string().max(4000), guest_url: z.string().max(4000) }),
  z.object({ action: z.literal('failed'), episode_id: z.string().uuid(), lease_token: z.string().uuid() }),
]);

export async function POST(request: Request) {
  const secret = process.env.POS_AUTOMATION_SECRET;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  if (!secret || !timingSafeEqual(digest(secret), digest(request.headers.get('x-pos-automation-secret') ?? ''))) {
    return NextResponse.json({error:'unauthorized'}, {status:401});
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error:'Invalid thumbnail request.'}, {status:400});
  const body = parsed.data;
  const admin = createAdminClient() as any;
  if (body.action === 'claim') {
    const {data,error} = await admin.rpc('claim_podcast_thumbnail', {p_show_slug:body.show_slug});
    return error ? NextResponse.json({error:'Thumbnail queue unavailable.'},{status:503}) : NextResponse.json(data ?? {});
  }
  const {data:task,error} = await admin.from('podcast_thumbnails').select('status,youtube_id,lease_token,lease_expires_at,storage_path').eq('episode_id',body.episode_id).maybeSingle();
  if (error) return NextResponse.json({error:'Thumbnail queue unavailable.'},{status:503});
  if (['ready','review'].includes(task?.status) && task.lease_token === body.lease_token) return NextResponse.json({ok:true});
  if (!task || task.status !== 'generating' || task.lease_token !== body.lease_token || Date.parse(task.lease_expires_at) <= Date.now()) {
    return NextResponse.json({error:'Thumbnail lease expired.'},{status:409});
  }
  const fail = async (message: string) => {
    await admin.from('podcast_thumbnails').update({status:'failed',error:message,lease_expires_at:null,updated_at:new Date().toISOString()})
      .eq('episode_id',body.episode_id).eq('lease_token',body.lease_token).eq('status','generating');
  };
  if (body.action === 'failed') {
    await fail('Make could not finish the thumbnail. Check the scenario and retry here.');
    return NextResponse.json({ok:true});
  }
  const {data:ep} = await admin.from('podcast_episodes').select('show_id,job_id,status,title,metadata').eq('id',body.episode_id).maybeSingle();
  const {data:link} = ep ? await admin.from('external_links').select('external_id').eq('job_id',ep.job_id).eq('link_type','youtube_video').maybeSingle() : {data:null};
  if (!ep || ['cancelled','archived','needs_revision'].includes(ep.status) || link?.external_id !== task.youtube_id) {
    await fail('The episode or linked video changed. Review it before retrying.');
    return NextResponse.json({error:'Episode changed.'},{status:409});
  }
  try {
    if (!body.hosts_url || !body.guest_url) throw new Error('Original hosts and guest photos are required. No generated faces will be substituted.');
    const [hosts, guest] = await Promise.all([loadThumbnailPhoto(body.hosts_url),loadThumbnailPhoto(body.guest_url)]);
    const bytes = await designedThumbnail(hosts, guest, ep.metadata?.copy?.title || ep.title || 'Mind Your Health',ep.metadata?.copy?.youtube_description || '');
    const path = `podcasts/${body.episode_id}/${body.lease_token}.jpg`;
    const saved = await admin.storage.from('thumbnails').upload(path,bytes,{contentType:'image/jpeg',upsert:true});
    if (saved.error) throw new Error('Could not save the thumbnail preview.');
    // Generated art is a draft until a team member reviews the faces and lettering.
    const completed = await admin.from('podcast_thumbnails').update({status:'review',storage_path:path,error:null,lease_expires_at:null,updated_at:new Date().toISOString()}).eq('episode_id',body.episode_id).eq('lease_token',body.lease_token).eq('status','generating').select('episode_id');
    if (completed.error || !completed.data?.length) throw new Error('Could not save thumbnail for review.');
    return NextResponse.json({ok:true});
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not finish the thumbnail.';
    await fail(message);
    return NextResponse.json({error:message},{status:502});
  }
}
