import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
async function access() {
  const client=await createClient();const {data:{user}}=await client.auth.getUser();
  if(!user)return null;
  const admin=createAdminClient() as any;const {data:staff}=await admin.from('team_members').select('id,role,is_active').eq('id',user.id).single();
  return staff?.is_active?{admin,staff}:null;
}
const Body=z.object({team_member_id:z.string().uuid(),starts_at:z.string().datetime(),ends_at:z.string().datetime(),reason:z.string().trim().max(200)}).refine(x=>Date.parse(x.ends_at)>Date.parse(x.starts_at));
export async function POST(request:Request) {
  const a=await access();if(!a)return NextResponse.json({error:'Unauthorized'},{status:401});
  const p=Body.safeParse(await request.json().catch(()=>null));if(!p.success)return NextResponse.json({error:'Choose a valid start and end time.'},{status:400});
  if(a.staff.role!=='admin'&&a.staff.id!==p.data.team_member_id)return NextResponse.json({error:'Forbidden'},{status:403});
  const {error}=await a.admin.from('schedule_blocks').insert({...p.data,is_available:false});
  return error?NextResponse.json({error:'Could not block this time.'},{status:500}):NextResponse.json({ok:true});
}
export async function DELETE(request:Request) {
  const a=await access();if(!a)return NextResponse.json({error:'Unauthorized'},{status:401});
  const id=new URL(request.url).searchParams.get('id');if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'Invalid time off.'},{status:400});
  let query=a.admin.from('schedule_blocks').delete().eq('id',id).eq('is_available',false);
  if(a.staff.role!=='admin')query=query.eq('team_member_id',a.staff.id);
  const {error}=await query;
  return error?NextResponse.json({error:'Could not remove time off.'},{status:500}):NextResponse.json({ok:true});
}
