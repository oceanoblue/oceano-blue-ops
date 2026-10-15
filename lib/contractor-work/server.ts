import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { agreementSnapshot, type ContractorAgreement } from './types';

export class WorkError extends Error { constructor(message: string, public status=400) { super(message); } }
export interface WorkActor { id: string; email: string; admin: boolean; contractorId: string|null; contractorActive: boolean; }
// Isolated ungenerated tables; existing generated database types stay untouched.
export function workDb(): SupabaseClient { return createAdminClient() as unknown as SupabaseClient; }
export async function workActor(): Promise<WorkActor> {
  const session=await createClient(); const {data:{user},error}=await session.auth.getUser();
  if (error || !user || !user.email || !user.email_confirmed_at) throw new WorkError('Please sign in with your verified account.',401);
  const db=workDb();
  const [staff,contractor]=await Promise.all([
    db.from('team_members').select('role,is_active').eq('id',user.id).maybeSingle(),
    db.from('contractors').select('id,is_active').eq('auth_user_id',user.id).maybeSingle()
  ]);
  if(staff.error || contractor.error) throw new WorkError('Account access could not be verified.',503);
  const admin=staff.data?.is_active===true && staff.data?.role==='admin';
  if(!admin && !contractor.data) throw new WorkError('This account does not have contractor access.',403);
  return {id:user.id,email:user.email,admin,contractorId:contractor.data?.id??null,contractorActive:contractor.data?.is_active===true};
}
export function requireAdmin(a:WorkActor):void { if(!a.admin) throw new WorkError('Office administrator access is required.',403); }
export async function ownAgreement(actor:WorkActor,id:string):Promise<ContractorAgreement> {
  let q=workDb().from('contractor_agreements').select('*').eq('id',id);
  if(!actor.admin) q=q.eq('contractor_id',actor.contractorId??'00000000-0000-0000-0000-000000000000');
  const {data,error}=await q.maybeSingle();
  if(error) throw new WorkError('Agreements are temporarily unavailable.',503);
  if(!data) throw new WorkError('Agreement not found.',404);
  return data as ContractorAgreement;
}
export function checkBodyOrigin(req:Request):void {
  const origin=req.headers.get('origin');
  if(!origin || origin!==new URL(req.url).origin) throw new WorkError('Reload this page before continuing.',403);
  if(!req.headers.get('content-type')?.includes('application/json')) throw new WorkError('JSON required.',415);
  if(Number(req.headers.get('content-length')||0)>90000) throw new WorkError('Request too large.',413);
}
export async function readWorkBody(req:Request):Promise<unknown> { checkBodyOrigin(req); const text=await req.text(); if(text.length>90000) throw new WorkError('Request too large.',413); try{return JSON.parse(text);}catch{throw new WorkError('Invalid request.');} }
export function workError(e:unknown):NextResponse { if(e instanceof WorkError) return NextResponse.json({error:e.message},{status:e.status}); console.error('[contractor-work]',e instanceof Error?e.message:'unexpected_error'); return NextResponse.json({error:'The request could not be completed. Please retry.'},{status:500}); }
export function assertCurrentHash(a:ContractorAgreement,hash:string):void { if(a.document_hash!==hash) throw new WorkError('The agreement changed. Reload and review the current version.',409); }
export function snapshotHash(a:Parameters<typeof agreementSnapshot>[0]):string {return createHash('sha256').update(agreementSnapshot(a),'utf8').digest('hex');}
export function signingCodeHash(id:string,actor:string,code:string):string {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!key) throw new WorkError('Signing is not configured.',503);
  return createHmac('sha256',key).update(`contractor-signature-v1:${id}:${actor}:${code}`).digest('hex');
}
export function htmlEscape(value:unknown):string {return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function appOrigin(req:Request):string { const origin=new URL(process.env.NEXT_PUBLIC_APP_URL||req.url).origin; if(!origin.startsWith('https://') && !origin.startsWith('http://localhost')) throw new WorkError('App URL is not configured.',503); return origin; }
export async function agreementEvent(id:string,actor:string,kind:string,details:Record<string,unknown>={}):Promise<void> {
  const {error}=await workDb().from('contractor_agreement_events').insert({agreement_id:id,actor_id:actor,kind,details});
  if(error) throw new WorkError('Could not save the audit event.',503);
}
