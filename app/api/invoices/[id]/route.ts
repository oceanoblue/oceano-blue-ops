import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { validDate } from '@/lib/booking/validation';
export async function PATCH(request: Request, context: {params:Promise<{id:string}>}) {
  const gate=await requireTeamMember();if(gate.error)return gate.error;
  const parsed=z.object({due_date:z.string().refine(validDate).nullable()}).strict().safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Choose a valid due date.'},{status:400});
  const {id}=await context.params;const db=await createClient() as any;
  const {data,error}=await db.from('orders').update({invoice_due_date:parsed.data.due_date}).eq('id',id).select('id').maybeSingle();
  if(error)return NextResponse.json({error:'Unable to save due date.'},{status:503});
  return NextResponse.json(data||{error:'Not found'},{status:data?200:404});
}
