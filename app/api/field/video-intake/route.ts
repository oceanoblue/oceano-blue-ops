import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email/resend';
import { type VideoIntake } from '@/lib/contractor-work/types';
import { createVideoRequest, closeVideoRequest, inspectVideoFolder, videoIntakePath } from '@/lib/contractor-work/dropbox-video';
import { WorkError, workActor, workDb, workError, readWorkBody, requireAdmin, htmlEscape as esc, appOrigin, type WorkActor } from '@/lib/contractor-work/server';
export const dynamic='force-dynamic';
export const maxDuration=60;
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),contractor_id:id,title:z.string().trim().min(2).max(180),location:z.string().trim().max(250).default(''),shoot_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),due_at:z.string().datetime({offset:true}).nullable().optional(),instructions:z.string().max(8000).default(''),project_id:id.nullable().optional(),order_id:id.nullable().optional()}),
  z.object({action:z.literal('upload_link'),id}),z.object({action:z.literal('check'),id}),z.object({action:z.literal('invite'),id}),
  z.object({action:z.literal('submit'),id,reported_file_count:z.number().int().min(1).max(40000),handoff_notes:z.string().max(8000),audio_status:z.enum(['included','not_recorded']),backup_confirmed:z.literal(true),originals_confirmed:z.literal(true),upload_complete:z.literal(true)}),
  z.object({action:z.literal('changes'),id,note:z.string().trim().min(5).max(4000)}),
  z.object({action:z.literal('receive'),id}),z.object({action:z.literal('cancel'),id}),z.object({action:z.literal('reopen'),id})
]);
const COLUMNS='id,contractor_id,project_id,order_id,title,location,shoot_date,due_at,instructions,status,dropbox_path,dropbox_url,dropbox_request_id,reported_file_count,verified_file_count,verified_bytes,file_manifest,handoff_notes,audio_status,backup_confirmed,originals_confirmed,revision_note,submitted_at,reviewed_at,created_by,created_at,updated_at';
type IntakeRecord=VideoIntake & {created_by:string};
async function own(actor:WorkActor,intakeId:string):Promise<IntakeRecord> {
  let q=workDb().from('contractor_video_intakes').select(COLUMNS).eq('id',intakeId);
  if(!actor.admin) q=q.eq('contractor_id',actor.contractorId);
  const {data,error}=await q.maybeSingle(); if(error) throw new WorkError('Video intake is temporarily unavailable.',503); if(!data) throw new WorkError('Video intake not found.',404); return data as unknown as IntakeRecord;
}
async function event(a:IntakeRecord,actor:WorkActor,kind:string,details:Record<string,unknown>={}) {
  const {error}=await workDb().from('contractor_video_intake_events').insert({intake_id:a.id,actor_id:actor.id,kind,details});
  if(error) console.error('[contractor-work] video audit event failed',kind);
}
async function notify(req:Request,a:IntakeRecord,toOffice:boolean,subject:string,message:string):Promise<boolean> {
  const db=workDb();
  const query=toOffice?db.from('team_members').select('email').eq('id',a.created_by).eq('is_active',true).eq('role','admin'):db.from('contractors').select('email').eq('id',a.contractor_id).eq('is_active',true);
  const {data,error}=await query.maybeSingle(); if(error || !data?.email) return false;
  const link=`${appOrigin(req)}/${toOffice?'dashboard/contractors':'field'}/video-intake?intake=${a.id}`;
  const result=await sendEmail({to:String(data.email),subject:`Oceano Blue: ${subject}`,html:`<p>${esc(message)}</p><p><strong>${esc(a.title)}</strong></p><p><a href="${esc(link)}">Open the private video handoff in Ops</a></p><p>Original video files stay in the assigned Dropbox intake. This message does not change a photo order or payment.</p>`});
  return result.status==='sent';
}
function writable(actor:WorkActor,a:IntakeRecord) {if(!actor.admin && !actor.contractorActive) throw new WorkError('This contractor account is inactive.',403);if(['received','cancelled'].includes(a.status)) throw new WorkError('This intake is closed. Contact the office.',409);}
export async function GET(req:Request) {
  try {
    const actor=await workActor(); const db=workDb(); const url=new URL(req.url);const wanted=url.searchParams.get('id');
    if(wanted) {if(!id.safeParse(wanted).success) throw new WorkError('Invalid intake identifier.');const intake=await own(actor,wanted);const {data:events,error}=await db.from('contractor_video_intake_events').select('id,kind,details,created_at').eq('intake_id',wanted).order('created_at',{ascending:true});if(error) throw new WorkError('Could not read handoff history.',503);return NextResponse.json({intake,events:events??[],admin:actor.admin},{headers:{'Cache-Control':'private, no-store'}});}
    let q=db.from('contractor_video_intakes').select(COLUMNS).order('created_at',{ascending:false}).limit(40);if(!actor.admin) q=q.eq('contractor_id',actor.contractorId);
    const before=url.searchParams.get('before');if(before){if(!z.string().datetime({offset:true}).safeParse(before).success) throw new WorkError('Invalid page.');q=q.lt('created_at',before);}
    const {data:items,error}=await q;if(error) throw new WorkError('Video intake is temporarily unavailable.',503);
    const contractors=actor.admin?await db.from('contractors').select('id,full_name,email').eq('is_active',true).order('full_name'):{data:[],error:null};if(contractors.error) throw new WorkError('Could not read contractors.',503);
    return NextResponse.json({items:items??[],contractors:contractors.data??[],admin:actor.admin,more:(items??[]).length===40},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return workError(e);}
}
export async function POST(req:Request) {
  try {
    const parsed=schema.safeParse(await readWorkBody(req));if(!parsed.success) throw new WorkError('Check the required fields and handoff confirmations.');
    const p=parsed.data;const actor=await workActor();const db=workDb();
    if(p.action==='create') {
      requireAdmin(actor);const {data:c,error}=await db.from('contractors').select('id,is_active').eq('id',p.contractor_id).maybeSingle();if(error || !c?.is_active) throw new WorkError('Choose an active contractor.');
      if(p.shoot_date && (Number.isNaN(Date.parse(p.shoot_date)) || new Date(p.shoot_date).toISOString().slice(0,10)!==p.shoot_date)) throw new WorkError('Choose a valid shoot date.');
      const {data,error:save}=await db.from('contractor_video_intakes').insert({contractor_id:c.id,title:p.title,location:p.location,shoot_date:p.shoot_date??null,due_at:p.due_at??null,instructions:p.instructions,project_id:p.project_id??null,order_id:p.order_id??null,created_by:actor.id}).select(COLUMNS).single();
      if(save) throw new WorkError('Could not create the handoff. Check any linked project or order.',503);
      await event(data as unknown as IntakeRecord,actor,'created');return NextResponse.json({id:data.id,message:'Video handoff created. Use Send invitation when you are ready to notify the contractor.'});
    }
    const a=await own(actor,p.id);
    if(p.action==='invite') {requireAdmin(actor);writable(actor,a);const sent=await notify(req,a,false,'video handoff invitation','You have a new original-video handoff to review. Sign in with your registered contractor email.');await event(a,actor,sent?'invitation_sent':'invitation_failed');return NextResponse.json({message:sent?'Invitation email sent.':'The invitation email could not be sent. Copy the private link or retry.'});}
    if(p.action==='check') {if(!a.dropbox_path) throw new WorkError('Prepare the upload link first.');const scan=await inspectVideoFolder(a.dropbox_path);return NextResponse.json({scan,message:`Dropbox currently contains ${scan.count} uploaded items. This is a file count, not a check of footage quality.`});}
    writable(actor,a);
    if(p.action==='upload_link') {
      if(a.dropbox_url) return NextResponse.json({url:a.dropbox_url,message:'Your private Dropbox upload link is ready.'});
      const token=randomUUID();const now=new Date();const path=videoIntakePath(a.id,a.title);
      const {data:lease,error}=await db.from('contractor_video_intakes').update({provision_token:token,provision_until:new Date(now.getTime()+120000).toISOString(),dropbox_path:path}).eq('id',a.id).is('dropbox_request_id',null).in('status',['assigned','submitted','changes_requested']).or(`provision_until.is.null,provision_until.lt.${now.toISOString()}`).select('id');
      if(error) throw new WorkError('Could not prepare the upload link.',503);
      if(!lease?.length) throw new WorkError('The upload link is being prepared. Retry in a moment.',409);
      let request:{id:string;url:string}|undefined;
      try {
        request=await createVideoRequest(path,a.title);
        const {data:saved,error:save}=await db.from('contractor_video_intakes').update({dropbox_request_id:request.id,dropbox_url:request.url,provision_token:null,provision_until:null}).eq('id',a.id).eq('provision_token',token).in('status',['assigned','submitted','changes_requested']).select('id');
        if(save || !saved?.length) {await closeVideoRequest(request.id).catch(()=>undefined);throw new WorkError('Could not save the upload link. Retry safely.',503);}
        await event(a,actor,'upload_link_created');return NextResponse.json({url:request.url,message:'Your private Dropbox upload link is ready.'});
      }finally {await db.from('contractor_video_intakes').update({provision_token:null,provision_until:null}).eq('id',a.id).eq('provision_token',token);}
    }
    if(p.action==='submit') {
      if(!['assigned','changes_requested'].includes(a.status)) throw new WorkError('This handoff was already submitted. Reload to see its status.',409);
      if(!a.dropbox_path || !a.dropbox_request_id) throw new WorkError('Prepare and finish the Dropbox upload first.');
      const scan=await inspectVideoFolder(a.dropbox_path);
      if(!scan.count || scan.bytes<=0 || scan.files.some(f=>f.size<=0)) throw new WorkError('No complete nonempty upload was found. Finish uploading and check for empty files.');
      if(scan.count!==p.reported_file_count) throw new WorkError(`Dropbox has ${scan.count} uploaded items, but you reported ${p.reported_file_count}. Finish uploads or correct the count. A ZIP counts as one uploaded item.`,409);
      const {data:saved,error}=await db.from('contractor_video_intakes').update({status:'submitted',reported_file_count:p.reported_file_count,verified_file_count:scan.count,verified_bytes:scan.bytes,file_manifest:scan.files,handoff_notes:p.handoff_notes,audio_status:p.audio_status,backup_confirmed:true,originals_confirmed:true,submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',a.id).eq('status',a.status).select('id');
      if(error || !saved?.length) throw new WorkError('The handoff changed. Reload before submitting.',409);
      await event(a,actor,'submitted',{file_count:scan.count,total_bytes:scan.bytes});const sent=await notify(req,a,true,'video files submitted','The contractor submitted original footage for office review.');
      return NextResponse.json({message:sent?'Handoff submitted and the office was emailed. Keep your backup until receipt is confirmed.':'Handoff submitted and saved. Office email was not confirmed; please contact the office. Keep your backup.'});
    }
    if(p.action==='reopen') {
      if(a.status!=='submitted') throw new WorkError('Only a handoff awaiting review can be reopened.',409);
      const {data,error}=await db.from('contractor_video_intakes').update({status:'changes_requested',revision_note:'The handoff was reopened to add or correct files.',updated_at:new Date().toISOString()}).eq('id',a.id).eq('status','submitted').select('id');
      if(error || !data?.length) throw new WorkError('The handoff changed. Reload before continuing.',409);
      await event(a,actor,'reopened');return NextResponse.json({message:'Reopened. Finish uploading, then verify and submit the complete handoff again.'});
    }
    requireAdmin(actor);
    if(p.action==='changes') {
      if(a.status!=='submitted') throw new WorkError('Only submitted handoffs can be returned for changes.',409);
      const {data,error}=await db.from('contractor_video_intakes').update({status:'changes_requested',revision_note:p.note,updated_at:new Date().toISOString()}).eq('id',a.id).eq('status','submitted').select('id');
      if(error || !data?.length) throw new WorkError('The handoff changed. Reload before continuing.',409);
      await event(a,actor,'changes_requested',{note:p.note});const sent=await notify(req,a,false,'video handoff needs attention',p.note);return NextResponse.json({message:sent?'Changes requested and the contractor was emailed.':'Changes requested. Email was not confirmed; please contact the contractor.'});
    }
    if(p.action==='receive') {
      if(a.status!=='submitted' || !a.dropbox_path) throw new WorkError('The contractor must submit this handoff before office receipt.',409);
      const scan=await inspectVideoFolder(a.dropbox_path);
      const canonical=(files:typeof scan.files)=>JSON.stringify([...files].sort((x,y)=>x.name.localeCompare(y.name)).map(f=>[f.name,f.size,f.content_hash??'']));
      if(scan.count!==a.reported_file_count || scan.bytes<=0 || canonical(scan.files)!==canonical(a.file_manifest)) throw new WorkError('Dropbox files changed after submission. Request a corrected submission before confirming receipt.',409);
    }
    if(a.dropbox_request_id) await closeVideoRequest(a.dropbox_request_id);
    const received=p.action==='receive';
    const {data,error}=await db.from('contractor_video_intakes').update({status:received?'received':'cancelled',reviewed_at:new Date().toISOString(),reviewed_by:actor.id,updated_at:new Date().toISOString()}).eq('id',a.id).eq('status',a.status).select('id');
    if(error || !data?.length) throw new WorkError('The handoff changed. Reload before continuing.',409);
    await event(a,actor,received?'received':'cancelled');
    const sent=await notify(req,a,false,received?'video handoff received':'video handoff cancelled',received?'The office confirmed receipt of your video handoff. Retain your backup for the period in your agreement.':'The office closed this video intake. Contact the office about any outstanding assignment or payment; closing intake does not cancel a contract.');
    return NextResponse.json({message:`${received?'Receipt confirmed':'Intake cancelled'} and the Dropbox file request was closed.${sent?' A notification email was sent.':' Email delivery was not confirmed.'}`});
  }catch(e){if(e instanceof Error && e.message.startsWith('Dropbox')) return workError(new WorkError(e.message,502));return workError(e);}
}
