'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { attribution } from '@/lib/marketing/performance';
import type { eventNames } from '@/lib/marketing/performance';
import { toEmbedUrl } from '@/lib/deliverables/embed';
type EventName=typeof eventNames[number];
export type PropertyAgent={name:string;names?:string;brokerage?:string;phone?:string;email?:string;image?:string};
export function PropertyExperience({slug,enabled,videoUrl,unbranded,filmTitle,filmNote,agent,children}:{slug:string;enabled:boolean;videoUrl:string;unbranded:boolean;filmTitle?:string;filmNote?:string;agent?:PropertyAgent|null;children?:React.ReactNode}){
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
 return <>{videoUrl&&<section id="film" className="ps-section ps-dark"><div className="ps-wrap ps-film"><div><h2 className="ps-h2">{filmTitle||'Three minutes at the property'}</h2><p className="ps-muted" style={{maxWidth:'34ch',lineHeight:1.6,margin:0}}>{filmNote||'A short film of the home and grounds. Turn the sound on.'}</p></div>{embed?<div className="ps-film-frame"><iframe ref={iframe} onLoad={subscribe} src={embed} title="Cinematic property film" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>:<a href={videoUrl} target="_blank" rel="noreferrer" className="ps-btn ps-btn-light">Watch the property film</a>}</div></section>}
 {children}
 {!unbranded&&enabled&&<section id="inquire" className="ps-section ps-dark"><div className="ps-wrap ps-inquire"><div><h2 className="ps-h2">See it in person</h2><p className="ps-muted" style={{maxWidth:'36ch',lineHeight:1.6,margin:0}}>Private showings are arranged directly with the listing agents. Send a note and they will reach out to set a time.</p>{agent&&<div className="ps-agent">{agent.image&&<img src={agent.image} alt="" />}<strong>{agent.names||agent.name}</strong>{(agent.brokerage||(agent.names&&agent.name!==agent.names?agent.name:''))&&<span className="ps-muted">{agent.brokerage||agent.name}</span>}{agent.phone&&<a href={`tel:${agent.phone.replace(/[^0-9+]/g,'')}`}>{agent.phone}</a>}{agent.email&&<a href={`mailto:${agent.email}`}>{agent.email}</a>}</div>}</div>
 <form onSubmit={submit} className="ps-form"><label>Name<input name="name" autoComplete="name" required maxLength={120}/></label><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label><label className="ps-full">Phone (optional)<input name="phone" type="tel" autoComplete="tel" maxLength={40}/></label><label className="ps-full">Message<textarea name="message" required maxLength={3000} defaultValue="I would like more information and to arrange a showing."/></label><label className="ps-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label><label className="ps-consent ps-full"><input name="consent" type="checkbox" required/><span>I agree to share these details with the listing agent and Oceano Blue Media so they can respond to my inquiry.</span></label><div className="ps-full"><button className="ps-btn ps-btn-light" disabled={busy}>{busy?'Sending…':'Request a showing'}</button></div><p role="status" className="ps-full" style={{margin:0,fontSize:'.9375rem'}}>{status}</p><p className="ps-fine ps-full">This page records aggregate marketing activity using a temporary browser session ID. Inquiry details stay private. Do Not Track and Global Privacy Control disable activity tracking.</p></form></div></section>}</>;
}
