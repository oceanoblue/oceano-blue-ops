'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Copy, ExternalLink, Eye, ImageIcon, Loader2, Mail, MessageSquare, Send, X } from 'lucide-react';
import { galleryReadyEmail, galleryReadySms } from '@/lib/email/templates';
import type { DeliveryDispatch } from '@/lib/deliveries/notifications';

type Context = {
 client: {full_name:string;email:string;phone:string}|null;
 listing: {address_line1:string;city:string;state:string;zip:string}|null;
 photoCount:number;mediaCount:number;phone:string|null;appUrl:string;
 channels:{email:boolean;sms:boolean};paywall:{active:boolean};
 teammates:{email:string;full_name:string|null}[];
 link:{id:string;token:string;view_count:number;download_count:number}|null;
 history:DeliveryDispatch[];
};
const statusLabel=(status:string)=>({sent:'Sent to providers',partial:'Partially sent',sending:'Sending / check status',prepared:'Preparing',needs_review:'Needs review',failed:'Not sent'}[status]||status);

export function DeliveryControl({orderId}:{orderId:string}) {
 const router=useRouter();
 const [data,setData]=useState<Context|null>(null);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);
 const [email,setEmail]=useState(true);const [sms,setSms]=useState(false);const [team,setTeam]=useState(false);
 const [message,setMessage]=useState('Thank you for choosing Oceano Blue Media. We hope you love your finished media!');
 const [tab,setTab]=useState<'email'|'sms'>('email');
 const [test,setTest]=useState(false);const [testEmail,setTestEmail]=useState('');const [testPhone,setTestPhone]=useState('');
 const [resend,setResend]=useState(false);
 const requestRef=useRef<{body:string;id:string}|null>(null);
 const initialized=useRef(false);const dialogRef=useRef<HTMLDivElement>(null);
 const load=useCallback(async()=>{
  const r=await fetch(`/api/delivery-link?order_id=${orderId}`,{cache:'no-store'});const j=await r.json();
  if(!r.ok)throw new Error(j.error||'Could not load delivery.');
  setData(j);
  if(!initialized.current){setEmail(j.channels.email&&Boolean(j.client?.email));setSms(j.channels.sms&&Boolean(j.phone));initialized.current=true;}
 },[orderId]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement as HTMLElement|null;
  dialogRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'&&!busy)setOpen(false);
   if(e.key==='Tab'){
    const items=dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea,select,[tabindex="0"]');
    if(!items?.length)return;
    if(e.shiftKey&&(document.activeElement===items[0]||document.activeElement===dialogRef.current)){e.preventDefault();items[items.length-1].focus();}
    else if(!e.shiftKey&&document.activeElement===items[items.length-1]){e.preventDefault();items[0].focus();}
   }
  };
  document.addEventListener('keydown',onKey);const old=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=old;previous?.focus();};
 },[open,busy]);

 async function prepare(){
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/delivery-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,action:'prepare'})});
   const j=await r.json();if(!r.ok)throw new Error(j.error);
   await load();setNotice('Gallery preview is ready. No messages have been sent.');
  }catch(e){setError(e instanceof Error?e.message:'Could not prepare gallery.');}finally{setBusy(false);}
 }
 async function send(){
  setBusy(true);setError('');setNotice('');
  const body=JSON.stringify({order_id:orderId,action:test?'test':'deliver',email,sms,include_team:team,message,resend,
   ...(test&&email?{test_email:testEmail}:{}),...(test&&sms?{test_phone:testPhone}:{})});
  if(requestRef.current?.body!==body)requestRef.current={body,id:crypto.randomUUID()};
  try{
   const r=await fetch('/api/delivery-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(body),request_id:requestRef.current.id})});
   const j=await r.json();if(!r.ok)throw new Error(j.error);
   setNotice(j.dispatch.status==='sent'?`${test?'Test delivery':'Delivery'} sent. See each channel’s result below.`:'Some messages need attention. Check the delivery history before sending again.');
   requestRef.current=null;setResend(false);await load();router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Delivery response was interrupted. Refresh the history before retrying.');}
  finally{setBusy(false);}
 }
 const latest=data?.history.find(h=>!h.is_test);
 const url=data?.link?`${data.appUrl}/gallery/${data.link.token}`:null;
 const ready=!!data&&(data.photoCount+data.mediaCount>0);
 const content={recipientName:test?'Test recipient':data?.client?.full_name,
  address:test?'Coastal Home · Sample gallery':data?.listing?.address_line1||'Your listing',
  cityStateZip:test?'Lowcountry, South Carolina':[data?.listing?.city,data?.listing?.state,data?.listing?.zip].filter(Boolean).join(', '),
  galleryUrl:test?`${data?.appUrl}/gallery/demo`:url||`${data?.appUrl}/gallery/your-private-link`,
  photoCount:test?6:data?.photoCount,locked:test?false:data?.paywall.active,message,isTest:test};
 const emailPreview=galleryReadyEmail(content);
 return <div className="space-y-3 text-sm">
  {error&&!open&&<p role="alert" className="text-rose-700">{error} <button className="underline" onClick={()=>void load().then(()=>setError('')).catch(e=>setError(e.message))}>Refresh</button></p>}
  {data?<>
   <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2 font-medium text-ocean-950"><ImageIcon className="h-4 w-4"/>{data.photoCount} photos · {data.mediaCount} media files</div>
    <p className="mt-1 text-xs text-slate-500">{latest?statusLabel(latest.status):'Preview, then send the gallery by email and text.'}</p></div>
   <button className="btn-primary w-full" onClick={()=>setOpen(true)}><Send className="h-4 w-4"/>Prepare delivery</button>
   {url&&<a className="inline-flex items-center gap-1 text-ocean-700 hover:underline" href={url} target="_blank" rel="noopener"><ExternalLink className="h-3 w-3"/>Open client gallery</a>}
  </>:!error&&<p className="text-slate-500">Loading delivery…</p>}
  {open&&data&&createPortal(<div className="fixed inset-0 z-[100] bg-slate-950/60 p-2 backdrop-blur-sm sm:p-6 grid place-items-center">
   <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="delivery-title" tabIndex={-1} className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none">
    <div className="flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-7"><div><p className="text-xs uppercase tracking-widest text-ocean-700">Client delivery</p><h2 id="delivery-title" className="text-xl font-semibold text-ocean-950">Ready for their next listing.</h2></div><button aria-label="Close delivery" disabled={busy} onClick={()=>setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>
    <div className="overflow-y-auto p-5 sm:p-7">
     <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-5">
       <div><h3 className="font-semibold text-ocean-950">{data.listing?.address_line1||'Client gallery'}</h3><p className="mt-1 text-slate-500">{data.photoCount} selected finished photos · {data.mediaCount} published media files</p>
        {!ready&&<p className="mt-2 text-amber-800">Select finished photos or publish media before delivering to the client. You can still send a sample test.</p>}
        {data.paywall.active&&<p className="mt-2 text-xs text-slate-500">Preview watermarks follow the global gallery setting. Downloads unlock after payment.</p>}</div>
       <label className="flex gap-3 rounded-xl border border-ocean-100 bg-ocean-50 p-3"><input type="checkbox" checked={test} disabled={busy} onChange={e=>setTest(e.target.checked)}/><span><strong>Send a test to yourself</strong><span className="block mt-1 text-xs text-slate-600">Uses a sample gallery. Does not notify the client or mark this order delivered.</span></span></label>
       <fieldset disabled={busy} className="space-y-3"><legend className="mb-2 font-semibold">Send via</legend>
        <label className="flex items-start gap-3 rounded-xl border p-3"><input type="checkbox" checked={email} disabled={!data.channels.email} onChange={e=>setEmail(e.target.checked)}/><Mail className="h-4 w-4 mt-0.5"/><span className="min-w-0"><strong>Email</strong><span className="block break-all text-xs text-slate-500">{data.channels.email?(test?'Your test email':data.client?.email||'Add an email to the client record'):'Email provider is not configured'}</span></span></label>
        {test&&email&&<label className="block text-xs font-medium">Test email<input className="input mt-1" type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="you@example.com"/></label>}
        <label className="flex items-start gap-3 rounded-xl border p-3"><input type="checkbox" checked={sms} disabled={!data.channels.sms} onChange={e=>setSms(e.target.checked)}/><MessageSquare className="h-4 w-4 mt-0.5"/><span><strong>Text message</strong><span className="block text-xs text-slate-500">{data.channels.sms?(test?'Your test mobile':data.phone||'Add a valid mobile number to the client record'):'Text provider is not configured'}</span></span></label>
        {test&&sms&&<label className="block text-xs font-medium">Test mobile<input className="input mt-1" type="tel" value={testPhone} onChange={e=>setTestPhone(e.target.value)} placeholder="(843) 555-0123"/></label>}
        {!test&&email&&data.teammates.length>0&&<label className="block text-xs"><input type="checkbox" checked={team} onChange={e=>setTeam(e.target.checked)}/> Also email opted-in teammates: {data.teammates.map(m=>m.email).join(', ')}</label>}
       </fieldset>
       <label className="block font-semibold">Personal note in email<textarea className="input mt-2 font-normal" rows={3} maxLength={1000} disabled={busy} value={message} onChange={e=>setMessage(e.target.value)}/></label>
       <div className="rounded-xl border p-4"><div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy||!ready} onClick={prepare}><Eye className="h-4 w-4"/>{url?'Refresh gallery preview':'Prepare gallery preview'}</button>
        {url&&<><a className="btn-secondary" href={url} target="_blank" rel="noopener">Open gallery <ExternalLink className="h-4 w-4"/></a><button className="btn-ghost" aria-label="Copy gallery link" onClick={()=>void navigator.clipboard.writeText(url).then(()=>setNotice('Gallery link copied.')).catch(()=>setError('Could not copy. Open the gallery and copy its address.'))}><Copy className="h-4 w-4"/></button></>}
       </div><p className="mt-2 text-xs text-slate-500">Previewing and copying a link do not send messages.</p></div>
      </div>
      <div><div className="flex items-center justify-between gap-2 mb-3"><h3 className="font-semibold">What your client receives</h3><div className="flex gap-1"><button className={tab==='email'?'btn-primary !px-3 !py-1':'btn-ghost !px-3 !py-1'} onClick={()=>setTab('email')}>Email</button><button className={tab==='sms'?'btn-primary !px-3 !py-1':'btn-ghost !px-3 !py-1'} onClick={()=>setTab('sms')}>Text</button></div></div>
       {tab==='email'?<><p className="mb-2 text-xs text-slate-500">Subject: {emailPreview.subject}</p><iframe title="Delivery email preview" sandbox="" srcDoc={emailPreview.html} className="h-[620px] w-full rounded-xl border bg-slate-50"/></>:<div className="rounded-3xl border bg-slate-50 p-6"><p className="mb-8 text-center text-xs text-slate-500">Oceano Blue Media</p><p className="rounded-2xl bg-slate-200 p-4 text-sm leading-relaxed break-words whitespace-pre-line">{galleryReadySms(content)}</p></div>}
       <a href="/gallery/demo/delivery" target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1 text-xs text-ocean-700 underline">Explore the sample client experience <ExternalLink className="h-3 w-3"/></a>
      </div>
     </div>
     <section className="mt-7 border-t pt-5"><div className="flex justify-between"><h3 className="font-semibold">Delivery history</h3><button className="text-xs text-ocean-700 underline" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Refresh status</button></div>
      <p className="mt-1 text-xs text-slate-500">Accepted means the provider accepted the message; it does not confirm inbox or handset receipt. Review uncertain attempts before sending again.</p>
      {!data.history.length?<p className="mt-3 text-sm text-slate-500">No messages sent yet.</p>:<ul className="mt-3 divide-y">{data.history.map(h=><li key={h.id} className="py-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{h.is_test?'Test · ':''}{statusLabel(h.status)}</strong><span className="text-xs text-slate-500">{new Date(h.created_at).toLocaleString()}</span></div>{h.recipients.map((r,i)=><p key={i} className="mt-1 break-words text-xs text-slate-600">{r.channel==='email'?'Email':'Text'} → {r.to} · {r.status==='accepted'?'Accepted by provider':r.status.replaceAll('_',' ')}{r.error?` — ${r.error}`:''}</p>)}</li>)}</ul>}
     </section>
    </div>
    <div className="border-t bg-slate-50 px-5 py-4 sm:px-7">
     {notice&&<p role="status" className="mb-3 text-sm text-ocean-800">{notice}</p>}{error&&<p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
     {latest&&!test&&<label className="mb-3 block text-xs text-slate-600"><input type="checkbox" checked={resend} disabled={busy} onChange={e=>setResend(e.target.checked)}/> I reviewed the previous delivery and want to send another notification to the selected recipients.</label>}
     <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500 flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>{test?'Only the test recipients above will be notified.':'The gallery link is included automatically.'}</span><button className="btn-primary" disabled={busy||(!test&&!ready)||(!email&&!sms)||(!test&&!!latest&&!resend)} onClick={send}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}{busy?'Working…':test?'Send test delivery':'Deliver to client'}</button></div>
    </div>
   </div>
  </div>,document.body)}
 </div>;
}
