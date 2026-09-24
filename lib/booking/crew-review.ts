import {createAdminClient} from '@/lib/supabase/server';
import {fetchMemberBusy} from '@/lib/google-calendar/api';
import {fmtDateInTz,fmtTimeInTz,localToUtc,dayOfWeekInTz} from '@/lib/utils/timezone';

export function workingHoursWarning(name:string,at:string,duration:number,hours:any[]) {
  const start=Date.parse(at),end=start+duration*60000;
  const dayHours=hours.filter(a=>a.is_active&&a.day_of_week===dayOfWeekInTz(fmtDateInTz(at,a.timezone,'iso'),a.timezone));
  if(dayHours.some(a=>{const day=fmtDateInTz(at,a.timezone,'iso');return start>=localToUtc(day,a.start_local,a.timezone).getTime()&&end<=localToUtc(day,a.end_local,a.timezone).getTime();}))return null;
  const schedule=dayHours.map(a=>`${a.start_local.slice(0,5)}–${a.end_local.slice(0,5)} (${a.timezone})`).join(', ');
  return `${name}: their visit is outside saved working hours${schedule?` (${schedule})`: ' (no hours configured for this day)'}. Confirm the full start and end time with them.`;
}
export async function reviewCrew(at:string|null,duration:number,members:string[],orderId?:string) {
  if(!at||Date.parse(at)<=Date.now())return [];
  const admin=createAdminClient() as any;
  const start=Date.parse(at),end=start+duration*60000;
  const warnings:string[]=[];
  for(const id of [...new Set(members)]) {
    const results=await Promise.all([
      admin.from('team_members').select('full_name').eq('id',id).single(),
      admin.from('team_availability').select('*').eq('team_member_id',id).eq('is_active',true),
      admin.from('team_calendar_connections').select('is_active').eq('team_member_id',id).eq('provider','google').maybeSingle(),
      admin.from('schedule_blocks').select('starts_at,ends_at,reason').eq('team_member_id',id).eq('is_available',false).lt('starts_at',new Date(end).toISOString()).gt('ends_at',at),
    ]);
    if(results.some(r=>r.error))throw new Error('Availability could not be checked. Try again before saving.');
    const name=results[0].data?.full_name||'Crew member';
    const hoursWarning=workingHoursWarning(name,at,duration,results[1].data||[]);
    if(hoursWarning)warnings.push(hoursWarning);
    let live:Awaited<ReturnType<typeof fetchMemberBusy>>|null=null;
    if(results[2].data&&!results[2].data.is_active)warnings.push(`${name}: Google Calendar needs reconnecting. Availability is not verified.`);
    else try{live=await fetchMemberBusy(id,at,new Date(end).toISOString());}catch{warnings.push(`${name}: live calendar is unavailable. Availability is not verified.`);}
    // Imported sync: blocks are only a fallback when Google cannot be read live.
    const blocks=(results[3].data||[]).filter((b:any)=>!live||live.source==='none'||!b.reason?.startsWith('sync:'));
    if(blocks.length)warnings.push(`${name}: saved calendar or time-off data marks this window busy${orderId?' (it may include this existing shoot)':''}. Check the shared calendar before confirming.`);
    if(live?.source==='none')warnings.push(`${name}: no Google Calendar connection or shared calendar. Availability is not verified.`);
    else if(live) {
      const busy=live.busy;
      if(busy.some(b=>Date.parse(b.start)<end&&Date.parse(b.end)>start))warnings.push(`${name}: Google Calendar shows busy time during ${fmtTimeInTz(at,'America/New_York')}–${fmtTimeInTz(new Date(end),'America/New_York')}${orderId?' (this may be the existing shoot hold)':''}. Review before confirming.`);
    }
  }
  return warnings;
}
