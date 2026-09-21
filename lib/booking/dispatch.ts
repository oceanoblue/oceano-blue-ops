import { createAdminClient } from '@/lib/supabase/server';
import { getAvailability } from './availability';
import { fmtDateInTz } from '@/lib/utils/timezone';
import { captureError } from '@/lib/observability/report';

/** Recheck calendars before offering the same reserved time to a backup. */
export async function runAssignmentDispatch() {
  const admin = createAdminClient() as any;
  const {data: settings,error:settingsError}=await admin.from('business_settings').select('scheduling_dispatch_enabled,default_timezone').eq('id',true).single();
  if(settingsError)throw settingsError;
  if(!settings.scheduling_dispatch_enabled)return [];
  // Manual assignments stay with the office; an expired request becomes visible
  // without silently assigning someone the office did not choose.
  const {error:manualError}=await admin.from('orders').update({assignment_state:'needs_attention',assignment_due_at:null})
    .eq('auto_dispatch',false).eq('assignment_state','awaiting_response').is('archived_at',null)
    .in('status',['booked','scheduled']).lte('assignment_due_at',new Date().toISOString());
  if(manualError)throw manualError;
  const {data: orders,error}=await admin.from('orders')
    .select('id,scheduled_at,duration_minutes,assignment_round,assignment_attempted_ids,listings(zip),order_items(product_id)')
    .eq('auto_dispatch',true).is('archived_at',null).in('status',['booked','scheduled'])
    .or(`assignment_state.eq.rerouting,and(assignment_state.eq.awaiting_response,assignment_due_at.lte.${new Date().toISOString()})`)
    .order('assignment_due_at',{ascending:true,nullsFirst:true}).limit(3);
  if(error)throw error;
  const results=[];
  for(const order of orders || []) {
    try {
      const available=order.scheduled_at && Date.parse(order.scheduled_at)>Date.now()
        ? await getAvailability(fmtDateInTz(order.scheduled_at,settings.default_timezone||'America/New_York','iso'),order.duration_minutes||60,undefined,
            {productIds:(order.order_items||[]).map((i:any)=>i.product_id).filter(Boolean),zip:order.listings?.zip,allCandidates:true,ignoreNotice:true})
        : {slots:[]};
      const candidates=available.slots.filter(s=>Date.parse(s.iso)===Date.parse(order.scheduled_at) && !order.assignment_attempted_ids.includes(s.photographer_id));
      let advanced=false;
      for(const candidate of candidates) {
        const result=await admin.rpc('advance_photographer_assignment',{p_order:order.id,p_round:order.assignment_round,p_member:candidate.photographer_id});
        if(result.error?.code==='23P01')continue; // another booking won the slot
        if(result.error)throw result.error;
        advanced=!!result.data; break; // false means a response or another worker won
      }
      if(!advanced) {
        const result=await admin.rpc('advance_photographer_assignment',{p_order:order.id,p_round:order.assignment_round,p_member:null});
        if(result.error)throw result.error;
        advanced=!!result.data;
      }
      results.push({id:order.id,advanced});
    } catch(error) { captureError('booking.dispatch',error,{orderId:order.id}); results.push({id:order.id,error:true}); }
  }
  return results;
}
