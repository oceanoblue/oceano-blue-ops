import { CAPTURE_SKILLS } from '@/lib/booking/capture-skills';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
const Body=z.object({team_member_id:z.string().uuid(),enabled:z.boolean(),capture_skills:z.array(z.enum(CAPTURE_SKILLS)).max(5),priority:z.number().int().min(1).max(1000),product_ids:z.array(z.string().uuid()).max(200).nullable(),service_zips:z.array(z.string().regex(/^\d{5}$/)).max(200),travel_minutes:z.number().int().min(0).max(240),cross_zip_minutes:z.number().int().min(0).max(240),color:z.string().regex(/^#[0-9a-fA-F]{6}$/)});
export async function POST(request:Request) {
  const client=await createClient();const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const admin=createAdminClient() as any;
  const {data:staff}=await admin.from('team_members').select('role,is_active').eq('id',user.id).single();
  if(!staff?.is_active||staff.role!=='admin')return NextResponse.json({error:'Only administrators can change routing.'},{status:403});
  const parsed=Body.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Check the priority, ZIP codes, and travel times.'},{status:400});
  const {error}=await admin.from('photographer_routing').upsert(parsed.data);
  return error?NextResponse.json({error:'Could not save routing.'},{status:500}):NextResponse.json({ok:true});
}
