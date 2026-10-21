'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { creditCost, editStatusLabel, type ClientEdit, type EditArea, type EditInput } from '@/lib/gallery-edits/schema';
import { defaultStaging, type StagingChoices } from '@/lib/gallery-edits/staging';
import { StagingOptions, StagingReference } from './StagingOptions';
type Photo={id:string;filename:string;url:string|null};
type State={remaining:number;enabled:boolean;edits:ClientEdit[]};
const defaultArea:EditArea={x:0.3,y:0.3,width:0.3,height:0.3};
export function PhotoEdits({token,photos,selectedPhoto,locked,demo=false}:{token:string;photos:Photo[];selectedPhoto?:string;locked:boolean;demo?:boolean}) {
  const [state,setState]=useState<State|null>(demo?{remaining:5,enabled:false,edits:[]}:null);
  const [photoId,setPhotoId]=useState(selectedPhoto || photos[0]?.id || '');
  const [operation,setOperation]=useState<EditInput['operation']>('declutter');
  const [staging,setStaging]=useState<StagingChoices>(defaultStaging);
  const [area,setArea]=useState<EditArea>(defaultArea);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const pending=useRef<{signature:string;id:string}|null>(null);
  const submitting=useRef(false);
  const endpoint=`/api/delivery/${encodeURIComponent(token)}/edits`;
  const load=useCallback(async()=>{
    if(demo || locked) return;
    try {
      const response=await fetch(endpoint,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || 'Unable to load photo edits.');
      setState(data);setError('');
    } catch(e){setError(e instanceof Error?e.message:'Unable to load photo edits.');}
  },[demo,locked,endpoint]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(selectedPhoto){setPhotoId(selectedPhoto);setArea(defaultArea);setConfirmed(false);}},[selectedPhoto]);
  const active=state?.edits.some(e=>['queued','running','review'].includes(e.status)) ?? false;
  useEffect(()=>{if(!active) return;const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer);},[active,load]);
  const photo=photos.find(p=>p.id===photoId);
  const cost=creditCost(operation);
  const disabled=busy || locked || demo || !state?.enabled || active;
  function moveArea(key:keyof EditArea,value:number){setArea(a=>{
    const next={...a,[key]:value};
    next.x=Math.min(next.x,1-next.width); next.y=Math.min(next.y,1-next.height);
    return next;
  });setConfirmed(false);}
  async function generate(){
    if(submitting.current || disabled || !confirmed || !photo || (state?.remaining??0)<cost) return;
    submitting.current=true;setBusy(true);setError('');setMessage('');
    const fields={photo_id:photoId,operation,options:operation==='declutter'?{area}:staging};
    const signature=JSON.stringify(fields);
    if(!pending.current || pending.current.signature!==signature) pending.current={signature,id:crypto.randomUUID()};
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:pending.current.id,...fields})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || 'Unable to submit your edit.');
      setMessage('Your edit is saved. We will review it before it appears here. You can close this page and return later.');
      pending.current=null;setConfirmed(false);await load();
    } catch(e){setError(e instanceof Error?e.message:'Connection interrupted. Retry to check the same request.');}
    finally {submitting.current=false;setBusy(false);}
  }
  return <section id="gallery-edits" className="mt-10 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-semibold text-ocean-950"><Sparkles className="h-5 w-5"/> Personalize your photos</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">A little less clutter. A room that feels like home. Your property order includes 5 credits, shared across its gallery links.</p></div><span className="rounded-full bg-ocean-50 px-4 py-2 text-sm font-semibold text-ocean-800">{state?`${state.remaining} credits available`:'5 credits included'}</span></div>
    {locked ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Complete payment to use your photo editing credits.</p> : <>
      {demo && <p className="mt-3 text-sm text-ocean-700">Preview the choices below. No edits or charges are made in this sample gallery.</p>}
      {state && !state.enabled && !demo && <p className="mt-3 text-sm text-amber-800">Photo editing is temporarily unavailable. Your credits are safe.</p>}
      <fieldset disabled={busy || locked || (!demo && (!state?.enabled || active))} className="mt-6 grid gap-6 lg:grid-cols-2">
        <div><label className="text-sm font-medium" htmlFor="edit-photo">1. Choose a photo</label><select id="edit-photo" className="input mt-2 w-full" value={photoId} onChange={e=>{setPhotoId(e.target.value);setArea(defaultArea);setConfirmed(false);}}>{photos.map(p=><option key={p.id} value={p.id}>{p.filename}</option>)}</select>
          {photo?.url && <div className="relative mt-3 overflow-hidden rounded-lg bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`Original: ${photo.filename}`} className="block h-auto w-full"/>
            {operation==='declutter' && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-white bg-ocean-500/25 ring-2 ring-ocean-700" style={{left:`${area.x*100}%`,top:`${area.y*100}%`,width:`${area.width*100}%`,height:`${area.height*100}%`}}/>}
          </div>}
          {operation==='declutter' && <div className="mt-3"><p className="text-xs leading-5 text-slate-500">Position the box over small loose objects. Only this area is edited. Leave permanent features and property defects visible.</p><div className="mt-3 grid grid-cols-2 gap-3">{(['x','y','width','height'] as const).map(key=><label key={key} className="text-xs text-slate-600">{{x:'Left / right',y:'Up / down',width:'Box width',height:'Box height'}[key]}<input aria-label={{x:'Horizontal position',y:'Vertical position',width:'Selection width',height:'Selection height'}[key]} type="range" min={key==='x'||key==='y'?0:0.05} max={key==='x'?1-area.width:key==='y'?1-area.height:0.5} step="0.01" value={area[key]} onChange={e=>moveArea(key,Number(e.target.value))} className="mt-1 block w-full accent-blue-600"/></label>)}</div></div>}
          {operation==='virtual_stage' && <StagingReference style={staging.style}/>}
        </div>
        <div><p className="text-sm font-medium">2. Choose your edit</p><div className="mt-2 grid gap-2">{([{id:'declutter',title:'Remove small clutter',hint:'Mail, cords and small personal items · 1 credit'},{id:'virtual_stage',title:'Virtual staging',hint:'Add furniture to an empty room · 2 credits'}] as const).map(item=><label key={item.id} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${operation===item.id?'border-ocean-500 bg-ocean-50':'border-slate-200'}`}><input type="radio" name="edit-operation" value={item.id} checked={operation===item.id} onChange={()=>{setOperation(item.id);setConfirmed(false);}}/><span><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-slate-600">{item.hint}</span></span></label>)}</div>
          {operation==='virtual_stage' && <StagingOptions value={staging} onChange={value=>{setStaging(value);setConfirmed(false);}}/>}
          <p className="mt-4 text-xs leading-5 text-slate-500">Oceano Blue reviews each result. Edits keep a visible disclosure label and are separate files up to 2048 px. Your original high-resolution files stay unchanged. Each new variation uses credits; downloads are free. Failed or rejected edits return credits.</p>
          <label className="mt-4 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>Use {cost} {cost===1?'credit':'credits'} for this edit. {operation==='virtual_stage'?'This is an empty interior room.':'The selected area contains only removable personal clutter.'}</span></label>
          <button type="button" className="btn-primary mt-4 w-full" disabled={disabled || !confirmed || (state?.remaining??0)<cost} onClick={()=>void generate()}>{busy?'Submitting…':`Request edit · ${cost} ${cost===1?'credit':'credits'}`}</button>
        </div>
      </fieldset>
      {active && <p role="status" className="mt-4 rounded-lg bg-ocean-50 p-3 text-sm text-ocean-800">One edit is in progress for this property. You can request another after its review.</p>}
      {message && <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {!demo && <button type="button" className="mt-4 inline-flex items-center gap-2 text-sm text-ocean-700 underline" onClick={()=>void load()}><RefreshCw className="h-3 w-3"/> Refresh edit status</button>}
      {!!state?.edits.length && <ul className="mt-5 space-y-3">{state.edits.map(edit=><li key={edit.id} className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-medium">{edit.operation==='virtual_stage'?'Virtual staging':'Clutter removal'} · {photos.find(p=>p.id===edit.photo_id)?.filename??'Photo'}</p><p className="mt-1 text-xs text-slate-500">{editStatusLabel[edit.status] ?? 'Processing'} · {edit.credits} {edit.credits===1?'credit':'credits'}</p>{edit.status==='approved' && <div className="mt-3 flex flex-wrap gap-3"><a className="btn-secondary" href={`${endpoint}/${edit.id}/download?size=web`} download>Download MLS edit</a><a className="btn-secondary" href={`${endpoint}/${edit.id}/download`} download>Download full-size edit</a></div>}</li>)}</ul>}
      <p className="mt-5 text-xs leading-5 text-slate-500">Need more edits? <a className="text-ocean-700 underline" href={`mailto:info@oceanoblue.net?subject=${encodeURIComponent('Additional photo editing credits')}`}>Ask us for options and pricing</a>. No automatic charges. For a correction to our delivery, use “Request changes” below without spending editing credits.</p>
    </>}
  </section>;
}
