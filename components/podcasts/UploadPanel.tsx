'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type UploadState = {
  configured:boolean;
  connection:{channel_id:string;channel_title:string}|null;
  upload:{status:string;uploaded_bytes:number;total_bytes:number|null;error:string|null;privacy:string|null}|null;
};
export function UploadPanel({episodeId,copyReady}:{episodeId:string;copyReady:boolean}) {
  const router=useRouter();
  const search=useSearchParams();
  const [state,setState]=useState<UploadState|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let live=true;
    async function refresh(){
      try {
        const response=await fetch(`/api/podcasts/youtube/upload?episode_id=${episodeId}`,{cache:'no-store'});
        const json=await response.json();
        if(!live)return;
        if(!response.ok){setError(json.error||'Could not load upload status.');return;}
        setState(json);setError(null);
        if(json.upload?.status==='uploaded')router.refresh();
      }catch{if(live)setError('Could not load upload status.');}
    }
    void refresh();
    const timer=setInterval(()=>void refresh(),10000);
    return ()=>{live=false;clearInterval(timer);};
  },[episodeId,router]);
  async function start(){
    setBusy(true);setError(null);
    try{
      const response=await fetch('/api/podcasts/youtube/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({episode_id:episodeId})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||'Could not start the upload.');
      setState(old=>old?{...old,upload:{status:'queued',uploaded_bytes:old.upload?.uploaded_bytes||0,total_bytes:old.upload?.total_bytes||null,error:null,privacy:null}}:old);
    }catch(e){setError(e instanceof Error?e.message:'Could not start upload.');}
    finally{setBusy(false);}
  }
  const upload=state?.upload;
  const percent=upload?.total_bytes?Math.min(100,Math.floor(Number(upload.uploaded_bytes)*100/Number(upload.total_bytes))):0;
  const active=upload?.status==='queued'||upload?.status==='uploading';
  const connectionError=search.get('youtube_error');
  return <section className="card border border-sky-200 bg-sky-50 p-5">
    <h2 className="font-semibold text-slate-900">{active?'Uploading to YouTube':copyReady?'Prepare YouTube review':'Preparing episode'}</h2>
    <p className="mt-1 text-sm text-slate-700">{!copyReady?'The transcript and descriptions are still being prepared.':active?
      'The original video is transferring in the background. You can leave this page. Review and publish controls appear when the upload finishes.':
      'Your copy is ready. The video needs a YouTube draft before you can approve publication. Nothing is made public until you approve it.'}</p>
    {state?.connection&&<p className="mt-2 text-sm">YouTube channel: <a className="text-ocean-700 underline" href={`https://www.youtube.com/channel/${state.connection.channel_id}`} target="_blank" rel="noreferrer">{state.connection.channel_title}</a></p>}
    {active&&<div className="mt-3"><progress className="h-2 w-full" value={percent} max={100} aria-label="YouTube upload progress"/><p className="mt-1 text-sm">{upload?.total_bytes?`${percent}% uploaded`:'Queued. The upload starts automatically.'}</p></div>}
    {(error||connectionError||upload?.error)&&<p className="mt-3 text-sm text-rose-700" role="alert">{error||connectionError||upload?.error}</p>}
    {state&&!state.connection&&state.configured&&<div className="mt-3"><a className="btn-primary" href={`/api/podcasts/youtube/connect?episode_id=${episodeId}`}>Connect YouTube</a><p className="mt-2 text-xs text-slate-600">Choose this show’s channel. Connecting starts this episode’s draft upload and enables automatic uploads for future episodes.</p></div>}
    {state&&!state.configured&&<p className="mt-3 text-sm text-amber-800">The studio’s Google connection needs configuration before automatic uploads can start.</p>}
    {state?.connection&&copyReady&&!active&&upload?.status!=='uploaded'&&<button onClick={start} disabled={busy} className="btn-primary mt-3">{busy?'Starting…':upload?.status==='failed'?'Retry upload':'Upload for review'}</button>}
    {state?.connection&&upload?.status==='failed'&&<a className="ml-3 text-sm underline" href={`/api/podcasts/youtube/connect?episode_id=${episodeId}`}>Reconnect YouTube</a>}
  </section>;
}
