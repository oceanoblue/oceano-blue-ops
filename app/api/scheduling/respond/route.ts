import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

const Body = z.object({ orderId: z.string().uuid(), round: z.number().int().min(1), response: z.enum(['accepted','declined']) });

export async function POST(request: Request) {
  const client = await createClient();
  const {data:{user}} = await client.auth.getUser();
  if (!user) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const parsed = Body.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:'Invalid assignment response.'}, {status:400});
  const admin = createAdminClient() as any;
  const {data:staff,error:staffError} = await admin.from('team_members').select('role,is_active').eq('id',user.id).single();
  if (staffError || !staff?.is_active || !['admin','photographer'].includes(staff.role)) return NextResponse.json({error:'Only the assigned photographer can respond.'}, {status:403});
  const {data,error} = await admin.rpc('respond_to_team_assignment', {p_order:parsed.data.orderId,p_round:parsed.data.round,p_member:user.id,p_response:parsed.data.response});
  if (error) return NextResponse.json({error:'Could not save your response. Please try again.'}, {status:500});
  if (!data) return NextResponse.json({error:'This assignment changed or expired. Refresh to see the current details.'}, {status:409});
  return NextResponse.json({ok:true});
}
