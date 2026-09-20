import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAvailability } from '@/lib/booking/availability';
import { rescheduleEligibility } from '@/lib/booking/reschedule';
import { fmtDateInTz } from '@/lib/utils/timezone';
import { validDate } from '@/lib/booking/validation';
import { enforceRateLimit } from '@/lib/security/rate-limit';
export const dynamic='force-dynamic';
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
async function access(context:Context) {
  const {id}=await context.params;const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return {error:new Response('Unauthorized',{status:401})} as const;
  const {data:clientIds,error:identityError}=await client.rpc('current_client_ids');
  if(identityError)return {error:new Response('Access unavailable',{status:503})} as const;
  if(!clientIds?.length)return {error:new Response('Forbidden',{status:403})} as const;
  const {data:order,error}=await client.from('orders').select('id,status,scheduled_at,photographer_id,duration_minutes').eq('id',id).in('client_id',clientIds).maybeSingle();
  if(error)return {error:new Response('Order unavailable',{status:503})} as const;
  if(!order)return {error:new Response('Not found',{status:404})} as const;
  const admin=createAdminClient({noStore:true}) as any;
  const {data:settings,error:settingsError}=await admin.from('business_settings').select('client_rescheduling_enabled,client_reschedule_cutoff_hours,default_timezone').eq('id',true).single();
  if(settingsError||!settings)return {error:new Response('Settings unavailable',{status:503})} as const;
  return {error:null,order,settings,admin,clientIds} as const;
}
export async function GET(request:Request,context:Context){
  const a=await access(context);if(a.error)return a.error;
  const reason=rescheduleEligibility(a.order,a.settings);
  if(reason)return NextResponse.json({error:reason},{status:409});
  const date=new URL(request.url).searchParams.get('date')||'';
  if(!validDate(date))return NextResponse.json({error:'Choose a date.'},{status:400});
  try {
    const available=await getAvailability(date,a.order.duration_minutes??60,a.order.photographer_id!);
    return NextResponse.json({...available,timezone:a.settings.default_timezone,previous:a.order.scheduled_at},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'We cannot verify the calendar. Please try again or contact us.'},{status:503});}
}
const bodySchema=z.object({request_id:z.string().uuid(),previous:z.string().datetime({offset:true}),scheduled_at:z.string().datetime({offset:true})});
export async function POST(request:Request,context:Context){
  const limited=await enforceRateLimit(request,'client-reschedule',10,600);if(limited)return limited;
  const a=await access(context);if(a.error)return a.error;
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Choose an available appointment.'},{status:400});
  const b=parsed.data;
  const {data:prior,error:priorError}=await a.admin.from('client_reschedule_requests').select('order_id,scheduled_at,previous_scheduled_at').eq('id',b.request_id).maybeSingle();
  if(priorError)return NextResponse.json({error:'Unable to verify the request. Please retry.'},{status:503});
  if(prior){
    if(prior.order_id!==a.order.id||Date.parse(prior.scheduled_at)!==Date.parse(b.scheduled_at)||Date.parse(prior.previous_scheduled_at)!==Date.parse(b.previous))return NextResponse.json({error:'This request changed. Please refresh.'},{status:409});
    return NextResponse.json({scheduled_at:prior.scheduled_at});
  }
  const reason=rescheduleEligibility(a.order,a.settings);
  if(reason)return NextResponse.json({error:reason},{status:409});
  try{
    const available=await getAvailability(fmtDateInTz(b.scheduled_at,a.settings.default_timezone||'America/New_York','iso'),a.order.duration_minutes??60,a.order.photographer_id!);
    if(!available.slots.some(s=>Date.parse(s.iso)===Date.parse(b.scheduled_at)))return NextResponse.json({error:available.calendarDegraded?'We cannot verify the calendar. Try again later.':'That time is no longer available. Choose another time.'},{status:available.calendarDegraded?503:409});
    const {data,error}=await a.admin.rpc('commit_client_reschedule',{p_request_id:b.request_id,p_order_id:a.order.id,p_client_ids:a.clientIds,p_previous:b.previous,p_scheduled_at:b.scheduled_at,p_photographer_id:a.order.photographer_id,p_duration:a.order.duration_minutes??60});
    if(error)return NextResponse.json({error:'The appointment changed or this time is unavailable. Refresh and choose another time.'},{status:409});
    return NextResponse.json({scheduled_at:data});
  }catch{return NextResponse.json({error:'Unable to confirm the change. Please retry with the same selection.'},{status:503});}
}
