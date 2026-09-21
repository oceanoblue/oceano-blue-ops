import { scheduleCalendarRanges } from '@/lib/booking/calendar-ranges';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, Settings2, AlertCircle, Plus } from 'lucide-react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchBusyRanges } from '@/lib/google-calendar/api';
import { calendarNeedsReconnect } from '@/lib/google-calendar/health';
import { fmtTimeInTz, fmtDateInTz, localToUtc, dayOfWeekInTz } from '@/lib/utils/timezone';
import { validDate } from '@/lib/booking/validation';
import { assignmentLabel } from '@/lib/booking/routing';
export const dynamic='force-dynamic';
function addDay(date:string,n:number){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
type Search={date?:string;week?:string;view?:string;photographer?:string;attention?:string};
type Shoot=any;
export default async function SchedulePage({searchParams}:{searchParams:Promise<Search>}) {
  const search=await searchParams;const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');
  const {data:me}=await client.from('team_members').select('id,is_active').eq('id',user.id).maybeSingle();if(!me?.is_active)redirect('/field/shoots');
  const admin=createAdminClient() as any;
  const {data:settings}=await admin.from('business_settings').select('default_timezone').eq('id',true).single();const tz=settings?.default_timezone||'America/New_York';
  const today=fmtDateInTz(new Date(),tz,'iso');const requested=search.date||search.week||today;const date=validDate(requested)?requested:today;
  const view=search.view==='day'?'day':'week';const dow=dayOfWeekInTz(date,tz);const start=view==='day'?date:addDay(date,-(dow===0?6:dow-1));const count=view==='day'?1:7;
  const days=Array.from({length:count},(_,i)=>addDay(start,i));const starts=localToUtc(start,'00:00',tz).toISOString(),ends=localToUtc(addDay(start,count),'00:00',tz).toISOString();
  const [membersResult,routingResult,connectionsResult,ordersResult,blocksResult,pendingResult]=await Promise.all([
    admin.from('team_members').select('id,full_name').eq('is_active',true).in('role',['admin','photographer']).order('full_name'),
    admin.from('photographer_routing').select('team_member_id,color,priority'),
    admin.from('team_calendar_connections').select('team_member_id,is_active,scope').eq('provider','google'),
    admin.from('orders').select('id,order_number,status,scheduled_at,duration_minutes,photographer_id,contractor_id,contractor_response,assignment_state,assignment_due_at,listings(address_line1,city),clients(full_name),contractors(team_member_id,full_name),order_items(description)').is('archived_at',null).not('status','in','(cancelled,draft)').gte('scheduled_at',starts).lt('scheduled_at',ends).order('scheduled_at'),
    admin.from('schedule_blocks').select('id,team_member_id,starts_at,ends_at,reason').eq('is_available',false).lt('starts_at',ends).gt('ends_at',starts),
    admin.from('orders').select('id,order_number,status,scheduled_at,photographer_id,contractor_id,contractor_response,assignment_state,assignment_due_at,listings(address_line1,city),clients(full_name),contractors(team_member_id,full_name),order_items(description)').is('archived_at',null).in('status',['booked','scheduled']).order('scheduled_at',{nullsFirst:true}),
  ]);
  const members=(membersResult.data||[]).map((m:any)=>({...m,color:routingResult.data?.find((p:any)=>p.team_member_id===m.id)?.color||'#475569'}));
  const selected=members.some((m:any)=>m.id===search.photographer)?search.photographer:undefined;
  const visible=members.filter((m:any)=>!selected||m.id===selected);
  const resolve=(o:Shoot)=>o.contractors?.team_member_id||o.photographer_id;
  const orders=(ordersResult.data||[]).filter((o:Shoot)=>!selected||resolve(o)===selected);
  const pending=(pendingResult.data||[]).filter((o:Shoot)=>(!selected||resolve(o)===selected)&&assignmentLabel(o)!=='Confirmed');
  const calendars=await Promise.all(visible.map(async(m:any)=>{
    const c=connectionsResult.data?.find((c:any)=>c.team_member_id===m.id);
    if(!c)return {...m,state:'Not connected',busy:[]};
    if(calendarNeedsReconnect(c))return {...m,state:'Reconnect needed',busy:[]};
    try{return {...m,state:'Connected',busy:await fetchBusyRanges(m.id,starts,ends)};}catch{return {...m,state:'Calendar unavailable',busy:[]};}
  }));
  const href=(change:Partial<Search>)=>{const q=new URLSearchParams();Object.entries({...search,date,week:undefined,...change}).forEach(([k,v])=>{if(v)q.set(k,v);});return `/dashboard/schedule?${q}`;};
  const name=(o:Shoot)=>o.contractors?.full_name||members.find((m:any)=>m.id===o.photographer_id)?.full_name||'Unassigned';
  const error=membersResult.error||routingResult.error||ordersResult.error||pendingResult.error||blocksResult.error||connectionsResult.error;
  function card(o:Shoot,color?:string) {
    const label=assignmentLabel(o);return <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="block rounded-xl border border-slate-200 border-l-4 bg-white p-3 shadow-sm transition hover:shadow-md focus-visible:outline-ocean-600" style={{borderLeftColor:color||'#d97706'}}>
      <div className="flex justify-between gap-2 text-xs text-slate-500"><span>{o.scheduled_at?fmtTimeInTz(o.scheduled_at,tz):'Date needed'}</span><span>#{o.order_number}</span></div>
      <p className="mt-2 break-words text-sm font-semibold text-ink-950">{o.listings?.address_line1||'Property details needed'}</p><p className="mt-1 text-xs text-slate-500">{o.clients?.full_name} · {o.listings?.city}</p>
      <p className="mt-2 text-xs font-medium" style={{color:color||'#92400e'}}>{name(o)}</p>
      <p className="mt-1 text-xs text-slate-500">{(o.order_items||[]).map((i:any)=>i.description).join(' · ')||'Services not entered'}{o.duration_minutes?` · ${o.duration_minutes} min`:''}</p>
      <span className={`mt-3 inline-block rounded-md px-2 py-1 text-[11px] font-medium ${label==='Confirmed'?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-900'}`}>{label}</span>
      {o.assignment_due_at&&label!=='Confirmed'&&<p className="mt-2 text-[11px] text-slate-500">{Date.parse(o.assignment_due_at)<Date.now()?'Response overdue':'Respond by'} {fmtTimeInTz(o.assignment_due_at,tz)}</p>}
    </Link>;
  }
  function dayCell(m:any,day:string) {
    const dayStart=localToUtc(day,'00:00',tz).getTime(),dayEnd=localToUtc(addDay(day,1),'00:00',tz).getTime();
    const shoots=orders.filter((o:Shoot)=>resolve(o)===m.id&&fmtDateInTz(o.scheduled_at,tz,'iso')===day);
    const dayBlocks=(blocksResult.data||[]).filter((b:any)=>b.team_member_id===m.id&&Date.parse(b.starts_at)<dayEnd&&Date.parse(b.ends_at)>dayStart);
    const blocks=dayBlocks.filter((b:any)=>!b.reason?.startsWith('sync:'));
    const cached=dayBlocks.filter((b:any)=>b.reason?.startsWith('sync:')).map((b:any)=>({start:b.starts_at,end:b.ends_at}));
    const hidden=[...shoots.map((o:Shoot)=>({start:o.scheduled_at,end:new Date(Date.parse(o.scheduled_at)+(o.duration_minutes||60)*60000).toISOString()})),...blocks.map((b:any)=>({start:b.starts_at,end:b.ends_at}))];
    const busy=scheduleCalendarRanges(m.busy.filter((b:any)=>Date.parse(b.start)<dayEnd&&Date.parse(b.end)>dayStart),cached,hidden);
    return <div className="space-y-2">{shoots.map((o:Shoot)=>card(o,m.color))}{blocks.map((b:any)=><div key={b.id} className="rounded-lg bg-slate-200 p-3 text-xs text-slate-700">Time off · {fmtTimeInTz(new Date(Math.max(Date.parse(b.starts_at),dayStart)),tz)}–{fmtTimeInTz(new Date(Math.min(Date.parse(b.ends_at),dayEnd)),tz)}</div>)}{busy.map((b:any,i:number)=><div key={i} className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">Calendar busy · {fmtTimeInTz(new Date(Math.max(Date.parse(b.start),dayStart)),tz)}–{fmtTimeInTz(new Date(Math.min(Date.parse(b.end),dayEnd)),tz)}</div>)}{!shoots.length&&!blocks.length&&!busy.length&&<p className="py-5 text-xs text-slate-400">No shoots scheduled</p>}</div>;
  }
  return <div className="order-workflow mx-auto max-w-[1600px] space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-medium uppercase tracking-widest text-ocean-700">People, properties & availability</p><h1 className="text-4xl">Schedule</h1><p className="mt-2 text-sm text-slate-500">A clear plan for every photographer · {tz==='America/New_York'?'Eastern Time':tz.replaceAll('_',' ')}</p></div><div className="flex flex-wrap gap-2"><Link href="/dashboard/settings/availability" className="btn-secondary"><Settings2 className="h-4 w-4"/>Hours & routing</Link><Link href="/dashboard/orders/new" className="btn-primary"><Plus className="h-4 w-4"/>New shoot</Link></div></header>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">Some schedule data could not load. Refresh before making scheduling decisions.</p>}
    <div className="grid grid-cols-3 gap-2 sm:gap-3"><div className="card flex flex-col justify-between p-3 sm:p-5"><p className="text-xs text-slate-500">Shoots in this {view}</p><p className="mt-2 text-2xl sm:text-3xl">{orders.length}</p></div><Link href={href({attention:search.attention?undefined:'1'})} className={`card flex flex-col justify-between p-3 sm:p-5 ${search.attention?'ring-2 ring-amber-500':''}`}><p className="text-xs text-amber-800">Needs attention · all dates</p><p className="mt-2 text-2xl sm:text-3xl">{pending.length}</p></Link><div className="card flex flex-col justify-between p-3 sm:p-5"><p className="text-xs text-slate-500">Calendar coverage</p><p className="mt-2 text-2xl sm:text-3xl">{calendars.filter((c:any)=>c.state==='Connected').length}<span className="text-lg text-slate-400"> / {calendars.length} connected</span></p></div></div>
    <div className="card flex flex-wrap items-center justify-between gap-4 p-4"><div className="flex items-center gap-3"><Link aria-label="Previous period" href={href({date:addDay(start,-count)})} className="btn-ghost"><ChevronLeft className="h-4 w-4"/></Link><p className="text-sm font-semibold">{view==='week'?'Week of ':''}{fmtDateInTz(new Date(`${start}T12:00:00Z`),tz,'long')}</p><Link aria-label="Next period" href={href({date:addDay(start,count)})} className="btn-ghost"><ChevronRight className="h-4 w-4"/></Link><Link href={href({date:today})} className="text-sm text-ocean-700">Today</Link></div><div className="flex gap-2">{['day','week'].map(v=><Link key={v} href={href({view:v,attention:undefined})} className={v===view?'btn-primary':'btn-secondary'}>{v==='day'?'Day':'Week'}</Link>)}</div></div>
    <nav aria-label="Photographer filter" className="flex flex-wrap gap-2"><Link href={href({photographer:undefined})} className={`rounded-full border px-4 py-2 text-sm ${!selected?'bg-ink-950 text-white':'bg-white'}`}>Everyone</Link>{members.map((m:any)=><Link key={m.id} href={href({photographer:m.id})} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${selected===m.id?'bg-ink-950 text-white':'bg-white'}`}><span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:m.color}}/>{m.full_name}</Link>)}</nav>
    {calendars.some((c:any)=>c.state!=='Connected')&&<div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><p>{calendars.filter((c:any)=>c.state!=='Connected').map((c:any)=>`${c.full_name}: ${c.state.toLowerCase()}`).join(' · ')}. Personal-calendar conflicts cannot be fully verified. <Link href="/dashboard/settings/availability" className="font-medium underline">Review calendar setup</Link></p></div>}
    {search.attention==='1'?<section><h2 className="mb-4 text-xl">Needs attention</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{pending.map((o:Shoot)=>card(o,members.find((m:any)=>m.id===resolve(o))?.color))}</div>{!pending.length&&<p className="card p-8 text-center text-slate-500">Every booked shoot has a confirmed photographer.</p>}</section>:<>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block"><div style={{minWidth:view==='week'?1080:600}}><div className="grid border-b bg-slate-50" style={{gridTemplateColumns:`180px repeat(${count},minmax(0,1fr))`}}><div className="p-4 text-xs font-medium text-slate-500">PHOTOGRAPHER</div>{days.map(d=><div key={d} className={`border-l p-4 text-sm font-medium ${d===today?'text-ocean-700':'text-slate-600'}`}>{new Intl.DateTimeFormat('en-US',{weekday:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${d}T12:00:00Z`))}</div>)}</div>{calendars.map((m:any)=><div key={m.id} className="grid border-b last:border-0" style={{gridTemplateColumns:`180px repeat(${count},minmax(0,1fr))`}}><div className="p-4"><span className="mb-3 block h-1 w-8 rounded-full" style={{backgroundColor:m.color}}/><p className="text-sm font-semibold">{m.full_name}</p><p className="mt-2 text-xs text-slate-500">{m.state}</p></div>{days.map(d=><div key={d} className={`min-h-48 min-w-0 border-l p-2 ${d===today?'bg-ocean-50/30':''}`}>{dayCell(m,d)}</div>)}</div>)}</div></div>
      <div className="space-y-5 lg:hidden">{days.map(d=><section key={d} className="card p-4"><h2 className="mb-4 text-lg">{fmtDateInTz(new Date(`${d}T12:00:00Z`),tz,'long')}</h2>{calendars.map((m:any)=><div key={m.id} className="mb-4 last:mb-0"><p className="mb-2 text-sm font-semibold" style={{color:m.color}}>{m.full_name}</p>{dayCell(m,d)}</div>)}</section>)}</div>
      {orders.some((o:Shoot)=>!resolve(o))&&<section className="rounded-xl border border-amber-200 p-5"><h2 className="mb-4 text-lg">Unassigned this {view}</h2><div className="grid gap-3 sm:grid-cols-2">{orders.filter((o:Shoot)=>!resolve(o)).map((o:Shoot)=>card(o))}</div></section>}
    </>}
  </div>;
}
