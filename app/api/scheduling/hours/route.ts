import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
const Time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
const Row=z.object({day_of_week:z.number().int().min(0).max(6),start_local:Time,end_local:Time,timezone:z.enum(['America/New_York','America/Chicago','America/Denver','America/Los_Angeles'])}).refine(r=>r.start_local.slice(0,5)<r.end_local.slice(0,5));
const Body=z.object({team_member_id:z.string().uuid(),rows:z.array(Row).max(7)}).refine(b=>new Set(b.rows.map(r=>r.day_of_week)).size===b.rows.length);
export async function PUT(request:Request) {
  const client=await createClient();const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const admin=createAdminClient() as any;
  const {data:staff}=await admin.from('team_members').select('id,role,is_active').eq('id',user.id).single();
  if(!staff?.is_active)return NextResponse.json({error:'Forbidden'},{status:403});
  const body=Body.safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({error:'Each workday needs an end time later than its start time.'},{status:400});
  if(staff.role!=='admin'&&staff.id!==body.data.team_member_id)return NextResponse.json({error:'Forbidden'},{status:403});
  const {error}=await admin.rpc('replace_photographer_hours',{p_member:body.data.team_member_id,p_rows:body.data.rows});
  return error?NextResponse.json({error:'Hours could not be saved. Your previous hours are unchanged.'},{status:500}):NextResponse.json({ok:true});
}
