'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { attribution } from '@/lib/marketing/performance';
import type { eventNames } from '@/lib/marketing/performance';
import { toEmbedUrl } from '@/lib/deliverables/embed';
type EventName=typeof eventNames[number];
export function PropertyExperience({slug,enabled,videoUrl,unbranded}:{slug:string;enabled:boolean;videoUrl:string;unbranded:boolean}){
 const iframe=useRef<HTMLIFrameElement>(null);const session=useRef('');const source=useRef({source:'direct',campaign:''});const played=useRef(new Set<string>());
 const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);const submission=useRef('');
 const track=useCallback((event:EventName)=>{
  if(!enabled||!session.current||navigator.doNotTrack==='1'||(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl)return;
  void fetch(`/api/property-public/${slug}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,session_id:session.current,event_id:crypto.randomUUID(),...source.current}),keepalive:true}).catch(()=>{});
 },[enabled,slug]);
 useEffect(()=>{
  source.current=attribution(new URLSearchParams(location.search),document.referrer);
  try{const key=`property-session-${slug}`;const saved=JSON.parse(sessionStorage.getItem(key)||'null');const id=saved&&Date.now()-saved.at<1800000?saved.id:crypto.randomUUID();session.current=id;sessionStorage.setItem(key,JSON.stringify({id,at:Date.now()}));}catch{session.current=crypto.randomUUID();}
  track('page_view');
  const click=(event:MouseEvent)=>{const link=(event.target as Element).closest('a');if(!link)return;const href=link.getAttribute('href')||'';if(href.startsWith('tel:'))track('phone_click');else if(href.startsWith('mailto:'))track('email_click');else if(link.dataset.propertyPhoto)track('photo_click');else if(href==='#inquire')track('showing_click');};
  document.addEventListener('click',click);return()=>document.removeEventListener('click',click);
 },[slug,track]);
 const embed=videoUrl?toEmbedUrl(videoUrl):null;
 const subscribe=useCallback(()=>{if(!iframe.current||!embed?.startsWith('https://player.vimeo.com/'))return;for(const name of ['play','timeupdate','ended'])iframe.current.contentWindow?.postMessage(JSON.stringify({method:'addEventListener',value:name}),'https://player.vimeo.com');},[embed]);
 useEffect(()=>{
  played.current.clear();
  const receive=(e:MessageEvent)=>{
   if(e.origin!=='https://player.vimeo.com'||e.source!==iframe.current?.contentWindow)return;
   let data;try{data=typeof e.data==='string'?JSON.parse(e.data):e.data;}catch{return;}
   if(data?.event==='ready')subscribe();
   const once=(event:EventName)=>{if(!played.current.has(event)){played.current.add(event);track(event);}};
   if(data?.event==='play')once('video_start');
   if(data?.event==='timeupdate'&&played.current.has('video_start'))for(const n of [25,50,75,100])if(Number(data.data?.percent)>=n/100)once(`video_${n}` as EventName);
   if(data?.event==='ended'&&played.current.has('video_start'))once('video_100');
  };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
 },[track,subscribe]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget;const values=new FormData(form);setBusy(true);setStatus('');if(!submission.current)submission.current=crypto.randomUUID();
  try{const response=await fetch(`/api/property-public/${slug}/inquiries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:values.get('name'),email:values.get('email'),phone:values.get('phone'),message:values.get('message'),website:values.get('website'),consent:values.get('consent')==='on',submission_id:submission.current,...source.current})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Please try again.');setStatus('Thank you. Your inquiry has been saved for the listing agent.');form.reset();submission.current='';}catch(error){setStatus(error instanceof Error?error.message:'Unable to send. Please try again.');}finally{setBusy(false);}
 }
 return <>{videoUrl&&<section id="film" className="mx-auto max-w-6xl px-6 pb-14"><h2 className="mb-6 font-serif text-3xl">The property film</h2>{embed?<iframe ref={iframe} onLoad={subscribe} className="aspect-video w-full rounded-xl bg-black" src={embed} title="Cinematic property film" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<a href={videoUrl} target="_blank" rel="noreferrer" className="underline">Watch the property film</a>}</section>}
 {!unbranded&&enabled&&<section id="inquire" className="mx-auto max-w-6xl px-6 pb-16"><div className="rounded-2xl bg-white p-6 sm:p-10"><p className="text-xs uppercase tracking-widest">Your next chapter starts here</p><h2 className="my-5 font-serif text-3xl">Request a private showing</h2><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Name<input className="input mt-1 block w-full" name="name" autoComplete="name" required maxLength={120}/></label><label className="text-sm">Email<input className="input mt-1 block w-full" name="email" type="email" autoComplete="email" required maxLength={254}/></label><label className="text-sm">Phone (optional)<input className="input mt-1 block w-full" name="phone" type="tel" autoComplete="tel" maxLength={40}/></label><label className="text-sm sm:col-span-2">How can we help?<textarea className="input mt-1 block min-h-28 w-full" name="message" required maxLength={3000} defaultValue="I would like more information and to arrange a showing."/></label><label className="hidden" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label><label className="flex items-start gap-3 text-sm sm:col-span-2"><input name="consent" type="checkbox" required className="mt-1"/>I agree to share these details with the listing agent and Oceano Blue Media so they can respond to my inquiry.</label><button className="btn-primary w-fit" disabled={busy}>{busy?'Sending…':'Send inquiry'}</button><p role="status" className="text-sm sm:col-span-2">{status}</p></form><p className="mt-5 text-xs text-slate-500">This page records aggregate marketing activity using a temporary browser session ID. Inquiry details stay private. Do Not Track and Global Privacy Control disable activity tracking.</p></div></section>}</>;
}
