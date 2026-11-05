import { requireTeamMember } from '@/lib/auth/require-team-member';
import { editDb,editJson,readSmallJson } from '@/lib/gallery-edits/server';
import { z } from 'zod';
export const dynamic='force-dynamic';
export async function GET() {
  const gate=await requireTeamMember(); if(gate.error) return gate.error;
  const db=editDb();
  const [rows,settings,accounts]=await Promise.all([
    db.from('gallery_edits').select('id,order_id,photo_id,operation,options,status,credits,allowance_cents,estimated_cost_cents,model,usage,output_path,created_at,orders(order_number),photos(filename)').order('created_at',{ascending:false}).limit(100),
    db.from('gallery_edit_settings').select('*').eq('id',true).single(),
    db.from('gallery_edit_accounts').select('*').order('reserved_spend_cents',{ascending:false}).limit(100),
  ]);
  if(rows.error || settings.error || accounts.error) return editJson({error:'Unable to load photo edits.'},503);
  const edits=await Promise.all((rows.data??[]).map(async(row:any)=>{
    const {output_path,...safe}=row;
    if(!output_path) return {...safe,original_url:null,result_url:null};
    const {data}=await db.storage.from('gallery-edits').createSignedUrls([`${row.order_id}/${row.id}/source.jpg`,output_path],300);
    return {...safe,original_url:data?.[0]?.signedUrl??null,result_url:data?.[1]?.signedUrl??null};
  }));
  return editJson({edits,settings:settings.data,accounts:accounts.data});
}
const schema=z.object({enabled:z.boolean(),allowance_cents:z.number().int().min(100).max(10000),order_budget_cents:z.number().int().min(100).max(100000),daily_budget_cents:z.number().int().min(100).max(1000000)}).strict().refine(s=>s.order_budget_cents>=s.allowance_cents && s.daily_budget_cents>=s.allowance_cents);
export async function PATCH(request:Request) {
  const gate=await requireTeamMember(); if(gate.error) return gate.error;
  const parsed=schema.safeParse(await readSmallJson(request));
  if(!parsed.success) return editJson({error:'Enter valid budget limits.'},400);
  const {error}=await editDb().from('gallery_edit_settings').update(parsed.data).eq('id',true);
  return error?editJson({error:'Unable to save limits.'},503):editJson({ok:true});
}
