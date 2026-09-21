import Link from 'next/link';
import { ArrowRight, Archive, ClipboardList, Plus, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, fmtDateTime, fmtCents } from '@/lib/utils/format';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ORDER_VIEWS, orderListHref } from '@/lib/orders/workflow';

export const dynamic = 'force-dynamic';
const SORT_KEYS=new Set(['order','address','client','scheduled','total','status']);
type SearchParams={view?:string;status?:string;q?:string;kind?:string;archived?:string;sort?:string;dir?:string;page?:string};
const COLUMNS:Column<any>[]=[
  {key:'address',header:'Property / order',cell:o=><div className="min-w-52"><Link href={`/dashboard/orders/${o.id}`} className="font-semibold text-ink-950 hover:text-ocean-700 hover:underline">{o.listings?.address_line1||`Order #${o.order_number}`}</Link><p className="mt-1 text-xs text-slate-500">#{o.order_number} · {[o.listings?.city,o.listings?.state].filter(Boolean).join(', ')}{o.order_kind==='reel_edit'?' · Reel':''}{o.rush?' · Rush':''}</p></div>},
  {key:'client',header:'Client',cell:o=><div className="min-w-36"><p className="font-medium text-slate-700">{o.clients?.full_name||'—'}</p>{o.clients?.brokerage&&<p className="mt-1 text-xs text-slate-500">{o.clients.brokerage}</p>}</div>},
  {key:'scheduled',header:'Appointment',cell:o=><span className={o.scheduled_at?'text-slate-600':'text-amber-800'}>{o.scheduled_at?fmtDateTime(o.scheduled_at):'Needs scheduling'}</span>},
  {key:'status',header:'Progress',cell:o=><StatusBadge status={o.status}/>},
  {key:'total',header:'Total',className:'text-right tabular-nums',cell:o=><div><p className="font-semibold text-ink-900">{fmtCents(o.total_cents)}</p><p className={`mt-1 text-xs ${o.download_paid_at?'text-emerald-700':'text-slate-500'}`}>{o.download_paid_at?'Paid':'Unpaid'}</p></div>},
];

export default async function OrdersPage(props:{searchParams:Promise<SearchParams>}) {
  const search=await props.searchParams;
  const view=ORDER_VIEWS.find(v=>v.id===search.view)??ORDER_VIEWS[0];
  const archived=search.archived==='1';
  const sortKey=search.sort&&SORT_KEYS.has(search.sort)?search.sort:'scheduled';
  const asc=search.dir?search.dir==='asc':view.id==='upcoming';
  const page=Math.max(1,Math.min(100000,Number.parseInt(search.page||'1',10)||1));
  const q=(search.q||'').slice(0,100);
  const explicit=search.status?.split(',').filter(status=>status in STATUS_LABEL);
  const statuses=explicit?.length?explicit:archived?null:view.statuses;
  const supabase=await createClient();
  const {data,error}=await (supabase as any).rpc('search_operations_orders',{
    p_statuses:statuses,p_kind:search.kind==='reel'?'reel_edit':null,p_archived:archived,p_query:q,p_sort:sortKey,p_ascending:asc,p_page:page,p_size:50,
  });
  const orders:any[]=data?.rows||[];const total=data?.total||0;const pages=Math.max(1,Math.ceil(total/50));
  const href=(changes:Record<string,string|undefined>)=>orderListHref(search,changes);
  const empty=<EmptyState icon={ClipboardList} title={q?'No matching orders':archived?'No archived orders':'You’re all caught up here'} description={q?'Try a different address, client, or order number.':'Choose another work area or create a new shoot.'} action={<Link href={href({view:'all',status:undefined,q:undefined})} className="btn-secondary">View all orders</Link>}/>;
  return <div className="order-workflow mx-auto max-w-[1440px] space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-ocean-700">Your production desk</p><h1 className="text-4xl text-ink-950">{archived?'Archived orders':'Orders'}</h1><p className="mt-2 text-sm text-slate-500">A clear path from booking to the client’s gallery.</p></div><div className="flex items-center gap-3"><Link className="btn-ghost min-h-11" href={href({archived:archived?undefined:'1',status:undefined})}><Archive className="h-4 w-4"/>{archived?'Active orders':'Archive'}</Link><Link href="/dashboard/orders/new" className="btn-primary min-h-11"><Plus className="h-4 w-4"/>New shoot</Link></div></header>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {!archived&&<nav aria-label="Order work queues" className="flex overflow-x-auto border-b border-slate-100 px-3 pt-2">{ORDER_VIEWS.map(item=><Link key={item.id} aria-current={!search.status&&view.id===item.id?'page':undefined} href={href({view:item.id,status:undefined})} className={`shrink-0 border-b-2 px-4 py-4 text-sm font-medium transition-colors ${!search.status&&view.id===item.id?'border-ocean-700 text-ocean-800':'border-transparent text-slate-500 hover:border-slate-200 hover:text-ink-950'}`}>{item.label}</Link>)}</nav>}
      <form action="/dashboard/orders" className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <input type="hidden" name="view" value={view.id}/>{archived&&<input type="hidden" name="archived" value="1"/>}{search.sort&&<input type="hidden" name="sort" value={search.sort}/>} {search.dir&&<input type="hidden" name="dir" value={search.dir}/>}
        <label className="min-w-52 flex-1 text-xs font-medium text-slate-600">Find an order<span className="relative mt-2 block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400"/><input name="q" defaultValue={q} maxLength={100} className="input !pl-9" placeholder="Search property, client, or order #"/></span></label>
        <label className="text-xs font-medium text-slate-600">Status<select name="status" defaultValue={search.status||''} className="input mt-2"><option value="">All in this view</option>{Object.entries(STATUS_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Type<select name="kind" defaultValue={search.kind||''} className="input mt-2"><option value="">All types</option><option value="reel">Reels</option></select></label>
        <button className="btn-secondary min-h-11">Apply</button>{(q||search.status||search.kind)&&<Link href={href({q:undefined,status:undefined,kind:undefined})} className="btn-ghost min-h-11">Clear filters</Link>}
      </form>
    </div>
    {!error&&<div className="flex items-center justify-between gap-3 text-sm"><p className="text-slate-500"><span className="font-semibold text-ink-900">{total}</span> {q?'matching ':''}order{total===1?'':'s'}{search.status?' · '+search.status.split(',').map(s=>STATUS_LABEL[s]).filter(Boolean).join(', '):''}</p><span className="text-xs text-slate-500">Page {page} of {pages}</span></div>}
    <div className="hidden md:block"><DataTable columns={COLUMNS.map(c=>({...c,sortable:true}))} rows={orders} sort={{key:sortKey,dir:asc?'asc':'desc'}} sortHref={key=>href({sort:key,dir:sortKey===key&&asc?'desc':'asc'})} rowKey={o=>o.id} rowHref={o=>`/dashboard/orders/${o.id}`} empty={empty} error={error?'Orders could not load. Refresh to try again.':null}/></div>
    <div className="space-y-3 md:hidden">{error?<p role="alert" className="card p-5 text-sm text-rose-700">Orders could not load. Refresh to try again.</p>:orders.length?orders.map(o=><Link key={o.id} href={`/dashboard/orders/${o.id}`} className="card block p-5"><div className="mb-3 flex justify-between gap-3"><span className="text-xs text-slate-500">#{o.order_number}</span><StatusBadge status={o.status}/></div><h2 className="text-xl font-semibold">{o.listings?.address_line1||`Order #${o.order_number}`}</h2><p className="mt-1 text-sm text-slate-500">{o.clients?.full_name||'No client'}</p><div className="mt-4 flex items-end justify-between gap-3 border-t pt-4"><div><p className="text-xs text-slate-500">{o.scheduled_at?fmtDateTime(o.scheduled_at):'Needs scheduling'}</p><p className="mt-1 text-sm font-semibold">{fmtCents(o.total_cents)} <span className="font-normal text-slate-500">· {o.download_paid_at?'Paid':'Unpaid'}</span></p></div><ArrowRight className="h-4 w-4 text-slate-400"/></div></Link>):empty}</div>
    {!error&&pages>1&&<nav aria-label="Order pages" className="flex items-center justify-between gap-3">{page>1?<Link className="btn-secondary min-h-11" href={href({page:String(page-1)})}>Previous</Link>:<span/>}{page<pages&&<Link className="btn-secondary min-h-11" href={href({page:String(page+1)})}>Next</Link>}</nav>}
  </div>;
}
