'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ClipboardList, UploadCloud, Images, Send, Check } from 'lucide-react';
import { nextOrderAction, type OrderWorkArea, type WorkflowFacts } from '@/lib/orders/workflow';

const areas = [
  {id:'overview',label:'Overview',hint:'Details & services',icon:ClipboardList},
  {id:'upload',label:'Upload & edit',hint:'Originals & finished files',icon:UploadCloud},
  {id:'review',label:'Review',hint:'Choose the final media',icon:Images},
  {id:'delivery',label:'Delivery',hint:'Preview & send',icon:Send},
] as const;
const Context = createContext<{active:OrderWorkArea; visited:OrderWorkArea[]; open:(id:OrderWorkArea)=>void} | null>(null);
export function useOrderAreaActive(id: OrderWorkArea) { const state=useContext(Context); return !state || state.active===id; }

export function OrderWorkspace({facts,children}:{facts:WorkflowFacts;children:ReactNode}) {
  const [active,setActive]=useState<OrderWorkArea>('overview');
  const [visited,setVisited]=useState<OrderWorkArea[]>(['overview']);
  const tabs=useRef<Array<HTMLButtonElement|null>>([]);
  const next=nextOrderAction(facts);
  function open(id:OrderWorkArea) {
    setActive(id); setVisited(prev=>prev.includes(id)?prev:[...prev,id]);
    // Keep reloads and shared links on the same work area without remounting an
    // active upload. Browser back/forward is handled by hashchange below.
    window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#${id}`);
  }
  useEffect(()=>{
    function restore(){ const id=window.location.hash.slice(1) as OrderWorkArea;
      if(areas.some(a=>a.id===id)){setActive(id);setVisited(prev=>prev.includes(id)?prev:[...prev,id]);}}
    restore();window.addEventListener('hashchange',restore);return()=>window.removeEventListener('hashchange',restore);
  },[]);
  return <Context.Provider value={{active,visited,open}}>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ocean-100 bg-gradient-to-r from-ocean-50 to-white p-5 sm:px-6">
        <div className="flex items-start gap-3"><span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ocean-700 ring-1 ring-ocean-100">{facts.status==='delivered'?<Check className="h-4 w-4"/>:<ArrowRight className="h-4 w-4"/>}</span>
          <div><p className="text-sm font-semibold text-ink-950">{next.title}</p><p className="mt-1 max-w-xl text-sm text-slate-600">{next.detail}</p></div></div>
        <button className="btn-secondary min-h-11" onClick={()=>{open(next.area);tabs.current[areas.findIndex(a=>a.id===next.area)]?.focus();}}>{next.label}<ArrowRight className="h-4 w-4"/></button>
      </div>
      <div role="tablist" aria-label="Order workspace" className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 sm:grid-cols-4">
        {areas.map((area,index)=><button key={area.id} ref={el=>{tabs.current[index]=el;}} id={`order-tab-${area.id}`} role="tab" aria-selected={active===area.id} aria-controls={`order-panel-${area.id}`} tabIndex={active===area.id?0:-1}
          onClick={()=>open(area.id)} onKeyDown={event=>{let target=index;if(event.key==='ArrowRight')target=(index+1)%areas.length;else if(event.key==='ArrowLeft')target=(index+areas.length-1)%areas.length;else if(event.key==='Home')target=0;else if(event.key==='End')target=areas.length-1;else return;event.preventDefault();tabs.current[target]?.focus();open(areas[target].id);}}
          className={`flex min-h-16 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500 sm:px-4 ${active===area.id?'bg-ink-950 text-white shadow-sm':'text-slate-600 hover:bg-slate-50'}`}>
          <area.icon className="h-5 w-5 shrink-0"/><span><span className="block text-sm font-semibold">{area.label}</span><span className={`mt-0.5 hidden text-xs sm:block ${active===area.id?'text-slate-300':'text-slate-500'}`}>{area.hint}</span></span>
        </button>)}
      </div>
      {children}
    </div>
  </Context.Provider>;
}

export function OrderWorkspacePanel({id,children}:{id:OrderWorkArea;children:ReactNode}) {
  const context=useContext(Context);
  return <section id={`order-panel-${id}`} role="tabpanel" aria-labelledby={`order-tab-${id}`} hidden={context?.active!==id} tabIndex={0} className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500 rounded-xl">
    {context?.visited.includes(id)?children:null}
  </section>;
}
export function OrderWorkspaceLink({area,children}:{area:OrderWorkArea;children:ReactNode}) {
  const context=useContext(Context);
  return <button type="button" onClick={()=>{context?.open(area);document.getElementById(`order-tab-${area}`)?.focus();}} className="btn-secondary min-h-11">{children}<ArrowRight className="h-4 w-4"/></button>;
}
