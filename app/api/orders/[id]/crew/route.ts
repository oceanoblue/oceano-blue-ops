import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient,createAdminClient} from '@/lib/supabase/server';
import {roleWindow} from '@/lib/booking/crew-windows';
import {reviewCrew} from '@/lib/booking/crew-review';
const Body=z.object({action:z.enum(['save','renew','review']),photographer_id:z.string().uuid().nullable().optional(),contractor_id:z.string().uuid().nullable().optional(),videographer_id:z.string().uuid().nullable().optional(),updated_at:z.string(),round:z.number().int().optional(),photo_offset:z.number().int().min(0).default(0),photo_duration:z.number().int().min(15).max(720).nullable().default(null),video_offset:z.number().int().min(0).default(0),video_duration:z.number().int().min(15).max(720).nullable().default(null),acknowledge_warnings:z.boolean().default(false)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const client=await createClient();const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const {data:staff}=await client.rpc('is_team_member');
  if(!staff)return NextResponse.json({error:'Forbidden'},{status:403});
  const parsed=Body.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid crew request'},{status:400});
  const b=parsed.data,{id}=await params,admin=createAdminClient() as any;
  const {data:o,error:readError}=await admin.from('orders').select('assignment_state,auto_dispatch,scheduled_at,duration_minutes,updated_at,photographer_id,videographer_id,contractor_id,assignment_round,photographer_start_offset_minutes,photographer_duration_minutes,videographer_start_offset_minutes,videographer_duration_minutes').eq('id',id).single();
  if(readError||!o)return NextResponse.json({error:'Order unavailable'},{status:404});
  // Replays of a completed renewal do not send again, even if the initial HTTP response was lost.
  if(b.action==='renew'&&b.round!==undefined&&o.assignment_round===b.round+1&&o.assignment_state==='awaiting_response'&&!o.auto_dispatch)return NextResponse.json({ok:true});
  if(o.updated_at!==b.updated_at)return NextResponse.json({error:'The order changed. Refresh before editing.'},{status:409});
  try {
    const photo=b.action!=='renew'?b.photographer_id:o.photographer_id,video=b.action!=='renew'?b.videographer_id:o.videographer_id;
    const timing=b.action==='renew'?o:{...o,photographer_start_offset_minutes:b.photo_offset,photographer_duration_minutes:b.photo_duration,videographer_start_offset_minutes:b.video_offset,videographer_duration_minutes:b.video_duration};
    const warnings:string[]=[];
    for(const [role,person] of [['photographer',photo],['videographer',video]] as const){if(!person)continue;const w=roleWindow(timing,role);if(w.offset+w.duration>(o.duration_minutes||60))return NextResponse.json({error:'Crew visits must fit inside the client appointment.'},{status:400});warnings.push(...await reviewCrew(w.start,w.duration,[person],id));}
    if(b.action==='review')return NextResponse.json({warnings});
    if(warnings.length&&!b.acknowledge_warnings)return NextResponse.json({error:'Review crew availability before continuing.',warnings},{status:409});
    const result=b.action==='renew'
      ?await (client as any).rpc('renew_order_assignment',{p_order:id,p_round:b.round,p_expected_updated_at:b.updated_at,p_availability_note:warnings.join(' ')})
      :await (client as any).rpc('set_order_crew',{p_order:id,p_photographer:b.photographer_id||null,p_contractor:b.contractor_id||null,p_videographer:b.videographer_id||null,p_expected_updated_at:b.updated_at,p_allow_overlap:b.acknowledge_warnings,p_photo_offset:b.photo_offset,p_photo_duration:b.photo_duration,p_video_offset:b.video_offset,p_video_duration:b.video_duration});
    if(result.error){const conflict=result.error.code==='23P01';return NextResponse.json({error:conflict?'A crew member has a booking, travel, or working-hours conflict.':result.error.message,warnings:conflict?['A crew member has a booking, travel, or working-hours conflict.']:undefined},{status:409});}
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to check availability'},{status:503});}
}
