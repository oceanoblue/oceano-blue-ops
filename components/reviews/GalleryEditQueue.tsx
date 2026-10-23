'use client';
import Link from 'next/link';
import { useCallback,useEffect,useState } from 'react';
import { editStatusLabel } from '@/lib/gallery-edits/schema';
type Row={id:string;order_id:string;operation:string;options:unknown;status:string;credits:number;allowance_cents:number;estimated_cost_cents:number|null;model:string|null;usage:unknown;orders:{order_number:number}|null;photos:{filename:string}|null;original_url:string|null;result_url:string|null};
type Settings={enabled:boolean;allowance_cents:number;order_budget_cents:number;daily_budget_cents:number};
type Account={order_id:string;remaining:number;attempts:number;reserved_spend_cents:number};
const money=(cents:number)=>(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
function ReviewEdit({row,reload}:{row:Row;reload:()=>Promise<void>}) {
  const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function decide(status:'approved'|'rejected'){
    setBusy(true);setError('');
    try{
      const response=await fetch(`/api/gallery-edits/${row.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,review_confirmed:checked})});
      if(!response.ok) throw new Error('Unable to save decision. Refresh to check its current status.');
      await reload();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save decision.');}finally{setBusy(false);}
  }
  return <li className="rounded-xl border bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><Link href={`/dashboard/orders/${row.order_id}`} className="font-medium text-ocean-700">Order #{row.orders?.order_number??'—'} · {row.photos?.filename??'Photo'}</Link><span className="text-sm text-slate-600">{editStatusLabel[row.status]}</span></div><p className="mt-2 text-sm">{row.operation==='virtual_stage'?'Virtual staging':'Clutter removal'} · {row.credits} credits</p>
    {row.status==='review' && <><div className="mt-4 grid gap-4 md:grid-cols-2">{[{title:'Original',url:row.original_url},{title:'Proposed edit',url:row.result_url}].map(item=><figure key={item.title}><figcaption className="mb-2 text-sm font-semibold">{item.title}</figcaption>{item.url?<a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={item.title} className="w-full rounded-lg"/></a>:<p className="text-sm text-rose-700">Image unavailable. Refresh before reviewing.</p>}</figure>)}</div><p className="mt-3 text-xs text-slate-500">Selected options: {JSON.stringify(row.options)}</p><label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={busy}/><span>I compared both images, including architecture, windows, property condition, edit boundaries and the disclosure label. I am ready to approve or reject this result.</span></label><div className="mt-3 flex flex-wrap gap-3"><button className="btn-primary" disabled={!checked||busy||!row.original_url||!row.result_url} onClick={()=>void decide('approved')}>Approve and release</button><button className="btn-secondary" disabled={!checked||busy} onClick={()=>void decide('rejected')}>Reject and refund credits</button></div></>}
    <details className="mt-3 text-xs text-slate-500"><summary>Cost and provider usage</summary><p className="mt-2">Reserved allowance: {money(row.allowance_cents)} · Provider estimate: {row.estimated_cost_cents===null?'Pending':money(row.estimated_cost_cents)} · Model: {row.model??'Pending'}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(row.usage,null,2)}</pre></details>{error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
  </li>;
}
export function GalleryEditQueue(){
  const [rows,setRows]=useState<Row[]>([]),[settings,setSettings]=useState<Settings|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState('');
  const load=useCallback(async()=>{try{
    const response=await fetch('/api/gallery-edits',{cache:'no-store'});const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Unable to load photo edits.');
    setRows(body.edits);setSettings(body.settings);setAccounts(body.accounts);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load photo edits.');}},[]);
  useEffect(()=>{void load();},[load]);
  async function save(){if(!settings)return;setBusy(true);setSaved('');try{
    const {enabled,allowance_cents,order_budget_cents,daily_budget_cents}=settings;
    const response=await fetch('/api/gallery-edits',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,allowance_cents,order_budget_cents,daily_budget_cents})});
    if(!response.ok)throw new Error('Unable to save. Budgets must cover at least one edit allowance.');
    setSaved('Editing limits saved.');await load();
  }catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}}
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Client photo edits</h2><p className="text-sm text-slate-500">Review generated variants before clients can download them.</p></div><button className="btn-secondary" onClick={()=>void load()}>Refresh edits</button></div>
    {settings && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-medium">Editing availability and budget controls</summary><div className="mt-4 space-y-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/> Enable client editing</label><div className="grid gap-3 sm:grid-cols-3">{([{key:'allowance_cents',label:'Allowance per attempt (cents)',max:10000},{key:'order_budget_cents',label:'Lifetime order budget (cents)',max:100000},{key:'daily_budget_cents',label:'Daily budget, Eastern time (cents)',max:1000000}] as const).map(field=><label key={field.key} className="text-sm">{field.label}<input className="input mt-1 w-full" type="number" min="100" max={field.max} step="1" value={settings[field.key]} onChange={e=>setSettings({...settings,[field.key]:Number(e.target.value)})}/></label>)}</div><p className="text-xs leading-5 text-slate-500">These are conservative spending allowances, not a provider billing cap. Reconcile actual provider usage before expanding access. Failed and rejected attempts keep their allowance. Maximum 10 attempts per order, 3 per 15 minutes, and one edit awaiting processing or review. Pausing blocks new renders; approved downloads remain available.</p><button className="btn-primary" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save editing limits'}</button>{saved&&<p role="status" className="text-sm text-emerald-700">{saved}</p>}<div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Order</th><th className="p-2">Credits left</th><th className="p-2">Attempts</th><th className="p-2">Reserved spend</th></tr></thead><tbody>{accounts.map(a=><tr key={a.order_id}><td className="p-2"><Link className="underline" href={`/dashboard/orders/${a.order_id}`}>{rows.find(r=>r.order_id===a.order_id)?.orders?.order_number??a.order_id.slice(0,8)}</Link></td><td className="p-2">{a.remaining}</td><td className="p-2">{a.attempts}</td><td className="p-2">{money(a.reserved_spend_cents)}</td></tr>)}</tbody></table></div></div></details>}
    {error?<p role="alert" className="text-sm text-rose-700">{error}</p>:rows.length?<ul className="space-y-4">{[...rows].sort((a,b)=>Number(b.status==='review')-Number(a.status==='review')).map(row=><ReviewEdit key={`${row.id}:${row.status}`} row={row} reload={load}/>)}</ul>:<p className="text-sm text-slate-500">No client photo edits yet.</p>}
  </section>;
}
