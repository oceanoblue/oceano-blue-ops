import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email/resend';
import { ESIGN_CONSENT, MASTER_AGREEMENT, MASTER_AGREEMENT_VERSION } from '@/lib/contractor-work/template';
import { type ContractorAgreement } from '@/lib/contractor-work/types';
import { WorkError, workActor, workDb, workError, readWorkBody, requireAdmin, ownAgreement, assertCurrentHash, signingCodeHash, htmlEscape, appOrigin, agreementEvent, type WorkActor } from '@/lib/contractor-work/server';

export const dynamic='force-dynamic';
export const maxDuration=60;
const name=z.string().trim().min(2).max(200).refine(v=>!/[\r\n\x00-\x1f]/.test(v),'Use a single-line legal name.');
const id=z.string().uuid();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const action=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),contractor_id:id,company_legal_name:name,contractor_legal_name:name}),
  z.object({action:z.literal('save'),id,document_hash:hash,body_text:z.string().min(100).max(50000)}),
  z.object({action:z.literal('issue'),id,document_hash:hash,signature_name:name,consent:z.literal(true),review_acknowledged:z.literal(true)}),
  z.object({action:z.literal('invite'),id}),
  z.object({action:z.literal('receipt'),id}),
  z.object({action:z.literal('void'),id,document_hash:hash,reason:z.string().trim().min(5).max(2000)}),
  z.object({action:z.literal('request_code'),id}),
  z.object({action:z.literal('sign'),id,document_hash:hash,signature_name:name,consent:z.literal(true),code:z.string().regex(/^\d{8}$/)})
]);

export async function GET(req:Request) {
  try {
    const actor=await workActor(); const db=workDb(); const url=new URL(req.url);
    const wanted=url.searchParams.get('id');
    if(wanted) {
      if(!id.safeParse(wanted).success) throw new WorkError('Invalid agreement identifier.');
      const agreement=await ownAgreement(actor,wanted);
      const {data:events,error}=await db.from('contractor_agreement_events').select('id,kind,details,created_at').eq('agreement_id',wanted).order('created_at',{ascending:true});
      if(error) throw new WorkError('Could not read agreement history.',503);
      return NextResponse.json({agreement,events:events??[],admin:actor.admin},{headers:{'Cache-Control':'private, no-store'}});
    }
    let q=db.from('contractor_agreements').select('*').order('created_at',{ascending:false}).limit(40);
    if(!actor.admin) q=q.eq('contractor_id',actor.contractorId);
    const before=url.searchParams.get('before');
    if(before) {if(!z.string().datetime({offset:true}).safeParse(before).success) throw new WorkError('Invalid page.');q=q.lt('created_at',before);}
    const {data:items,error}=await q;
    if(error) throw new WorkError('Agreements are temporarily unavailable.',503);
    const contractors=actor.admin?await db.from('contractors').select('id,full_name,email').eq('is_active',true).order('full_name'):{data:[],error:null};
    if(contractors.error) throw new WorkError('Contractors are temporarily unavailable.',503);
    return NextResponse.json({items:items??[],contractors:contractors.data??[],admin:actor.admin,more:(items??[]).length===40},{headers:{'Cache-Control':'private, no-store'}});
  } catch(e) { return workError(e); }
}
async function invitation(req:Request,a:ContractorAgreement,actor:WorkActor) {
  const link=`${appOrigin(req)}/field/agreements?agreement=${a.id}`;
  const result=await sendEmail({to:a.contractor_email,subject:'Oceano Blue: review and sign your contractor agreement',html:`<p>Hello ${htmlEscape(a.contractor_legal_name)},</p><p>Please review your master contractor agreement with ${htmlEscape(a.company_legal_name)}. Sign in with this email address to read, download and sign it.</p><p><a href="${htmlEscape(link)}">Review agreement securely in Ops</a></p><p>You do not need to sign immediately. Please contact info@oceanoblue.net with questions or to request paper signing. No assignment is accepted by opening this link.</p>`});
  await agreementEvent(a.id,actor.id,result.status==='sent'?'invitation_sent':'invitation_failed',{delivery_status:result.status});
  return result.status==='sent'?'Agreement is available and the invitation email was sent.':'Agreement is available, but the invitation email was not sent. Copy the private link or retry Send invitation.';
}
async function receipt(req:Request,a:ContractorAgreement,actor:WorkActor) {
  const link=`${appOrigin(req)}/field/agreements?agreement=${a.id}`;
  const recipients=[...new Set([a.contractor_email,a.company_signature?.email].filter((v):v is string=>Boolean(v)))];
  const results=await Promise.all(recipients.map(to=>sendEmail({to,subject:'Oceano Blue: completed contractor agreement',html:`<p>The master contractor agreement for ${htmlEscape(a.contractor_legal_name)} has been signed by both parties.</p><p><a href="${htmlEscape(link)}">Download your agreement and signature record</a></p><p>Agreement ID: ${htmlEscape(a.id)}<br>Document SHA-256: ${htmlEscape(a.document_hash)}</p>`})));
  const delivered=results.every(r=>r.status==='sent');
  await agreementEvent(a.id,actor.id,delivered?'receipt_sent':'receipt_delivery_incomplete');
  return delivered;
}
function requireSigner(actor:WorkActor,a:ContractorAgreement) {
  if(actor.contractorId!==a.contractor_id || !actor.contractorActive || actor.email.toLowerCase()!==a.contractor_email.toLowerCase()) throw new WorkError('Sign in with the active contractor account named in this agreement.',403);
  if(a.status!=='issued') throw new WorkError('This agreement is not awaiting a signature.',409);
}
const codeErrors:Record<string,string>={wait_60_seconds:'Wait 60 seconds before requesting another code.',signing_code_hourly_limit:'Five codes have been requested this hour. Try again after the current hour window.',incorrect_signing_code:'That signing code is not correct.',request_new_signing_code:'The code expired or reached its attempt limit. Request a new code.',document_changed_reload:'The document changed. Reload and review it.',agreement_not_signable:'This agreement is no longer awaiting signature.',forbidden:'The contractor account is not authorized to sign this agreement.'};
export async function POST(req:Request) {
  try {
    const parsed=action.safeParse(await readWorkBody(req)); if(!parsed.success) throw new WorkError('Check the required fields and consent checkboxes.');
    const p=parsed.data; const actor=await workActor(); const db=workDb();
    if(p.action==='create') {
      requireAdmin(actor);
      const {data:c,error}=await db.from('contractors').select('id,email,is_active').eq('id',p.contractor_id).maybeSingle();
      if(error || !c?.is_active) throw new WorkError('Choose an active contractor.');
      const {data,error:save}=await db.from('contractor_agreements').insert({contractor_id:c.id,company_legal_name:p.company_legal_name,contractor_legal_name:p.contractor_legal_name,contractor_email:String(c.email).toLowerCase(),body_text:MASTER_AGREEMENT,esign_consent:ESIGN_CONSENT,template_version:MASTER_AGREEMENT_VERSION,created_by:actor.id,last_actor_id:actor.id}).select('id').single();
      if(save) throw new WorkError('Could not create the agreement draft.',503);
      return NextResponse.json({id:data.id,message:'Draft created. Review the full text before issuing it.'});
    }
    const a=await ownAgreement(actor,p.id);
    if(p.action==='request_code') {
      requireSigner(actor,a); const code=String(randomInt(10000000,100000000));
      const {data,error}=await db.rpc('request_contractor_signature_code',{p_agreement:a.id,p_actor:actor.id,p_hash:signingCodeHash(a.id,actor.id,code)});
      if(error) throw new WorkError('Could not prepare signing verification.',503);
      if(data?.error) throw new WorkError(codeErrors[data.error]??'Could not request a signing code.',429);
      const mail=await sendEmail({to:a.contractor_email,subject:'Your Oceano Blue agreement signing code',html:`<p>Your signing code is:</p><p style="font-size:28px;letter-spacing:4px"><strong>${code}</strong></p><p>It expires in 10 minutes and is only valid for agreement ${htmlEscape(a.id)}. Enter it only in Oceano Blue Ops after reviewing the agreement. Never share this code with anyone.</p><p>Requesting a code does not sign the agreement.</p>`});
      await agreementEvent(a.id,actor.id,mail.status==='sent'?'signing_code_emailed':'signing_code_email_failed');
      if(mail.status!=='sent') throw new WorkError('The signing code email could not be sent. Contact the office or retry after 60 seconds.',503);
      return NextResponse.json({message:'An 8-digit signing code was sent to the email on this agreement.'});
    }
    if(p.action==='sign') {
      requireSigner(actor,a); assertCurrentHash(a,p.document_hash);
      const {data,error}=await db.rpc('complete_contractor_signature',{p_agreement:a.id,p_actor:actor.id,p_hash:signingCodeHash(a.id,actor.id,p.code),p_name:p.signature_name,p_document_hash:p.document_hash,p_browser:(req.headers.get('user-agent')||'').slice(0,500)});
      if(error) throw new WorkError('Could not complete the signature.',503);
      if(data?.error) throw new WorkError(codeErrors[data.error]??'Signature could not be accepted.',409);
      let mailed=false;
      try {mailed=await receipt(req,await ownAgreement(actor,a.id),actor);}catch{console.error('[contractor-work] completion receipt delivery failed');}
      return NextResponse.json({message:mailed?'Agreement signed. A receipt was emailed to both parties.':'Agreement signed and saved. Receipt email was not confirmed; download your copy here.'});
    }
    requireAdmin(actor);
    if(p.action==='receipt') {if(a.status!=='executed') throw new WorkError('The agreement has not been completed.',409); const ok=await receipt(req,a,actor); return NextResponse.json({message:ok?'Receipt sent.':'The record is saved, but email delivery failed. Please retry.'});}
    if(p.action==='invite') {if(a.status!=='issued') throw new WorkError('Only issued agreements can be sent for signature.',409);return NextResponse.json({message:await invitation(req,a,actor)});}
    assertCurrentHash(a,p.document_hash);
    if(p.action==='save') {
      if(a.status!=='draft') throw new WorkError('Only unsigned drafts can be edited.',409);
      const {data,error}=await db.from('contractor_agreements').update({body_text:p.body_text,last_actor_id:actor.id}).eq('id',a.id).eq('status','draft').eq('document_hash',p.document_hash).select('id');
      if(error || !data?.length) throw new WorkError('The draft changed. Reload before saving.',409);
      return NextResponse.json({message:'Draft saved. Review this new version before issuing it.'});
    }
    if(p.action==='void') {
      if(!['draft','issued'].includes(a.status)) throw new WorkError('Completed agreements cannot be voided or erased here.',409);
      const {data,error}=await db.from('contractor_agreements').update({status:'void',void_reason:p.reason,last_actor_id:actor.id}).eq('id',a.id).eq('status',a.status).eq('document_hash',p.document_hash).select('id');
      if(error || !data?.length) throw new WorkError('The agreement changed. Reload before continuing.',409);
      return NextResponse.json({message:'Agreement voided. Its existing record has been retained.'});
    }
    if(a.status!=='draft') throw new WorkError('This agreement has already been issued.',409);
    const {data,error}=await db.from('contractor_agreements').update({status:'issued',last_actor_id:actor.id,company_signature:{name:p.signature_name,email:actor.email,user_id:actor.id,at:new Date().toISOString(),consent:a.esign_consent,method:'verified office account + explicit consent + typed signature',browser:(req.headers.get('user-agent')||'').slice(0,500)}}).eq('id',a.id).eq('status','draft').eq('document_hash',p.document_hash).select('id');
    if(error || !data?.length) throw new WorkError('The agreement changed. Reload before issuing it.',409);
    let message='Agreement issued and company signature saved. Email was not confirmed; copy the private link or retry Send invitation.';
    try {message=await invitation(req,await ownAgreement(actor,a.id),actor);}catch{console.error('[contractor-work] invitation delivery failed');}
    return NextResponse.json({message});
  } catch(e) {return workError(e);}
}
