'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ThumbnailPanel({episodeId, ready, published}:{episodeId:string;ready:boolean;published:boolean}) {
  const router=useRouter();
  const [status,setStatus]=useState(ready?'ready':'queued');
  const [url,setUrl]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const refreshed=useRef(ready);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try {
        const res=await fetch(`/api/podcasts/thumbnails?episode_id=${episodeId}`,{cache:'no-store'});
        const body=await res.json();
        if(!active)return;
        if(!res.ok) {setError(body.error || 'Could not load thumbnail status.');return;}
        const next=body.thumbnail?.status ?? 'queued';
        setStatus(next);setUrl(body.preview_url);setError(body.thumbnail?.error ?? null);
        if(next==='ready' && !refreshed.current){refreshed.current=true;router.refresh();}
      }catch{if(active)setError('Could not load thumbnail status.');}
    };
    void load();
    const timer=setInterval(()=>{if(!refreshed.current)void load();},15000);
    return ()=>{active=false;clearInterval(timer);};
  },[episodeId,router]);
  async function retry(){
    setBusy(true);setError(null);
    try{
      const res=await fetch('/api/podcasts/thumbnails',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({episode_id:episodeId})});
      const data=await res.json();
      if(!res.ok)setError(data.error);else{setStatus('queued');router.refresh();}
    }catch{setError('Could not retry. Please try again.');}finally{setBusy(false);}
  }
  return <section className="card p-5">
    <h2 className="font-semibold text-slate-900">YouTube thumbnail</h2>
    {status==='ready' ? <>
      {url ? <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Custom thumbnail applied to this YouTube episode" className="mt-3 aspect-video w-full max-w-2xl rounded-lg object-contain" />
      </a> : <p className="mt-2 text-sm text-slate-600">Loading thumbnail preview…</p>}
      <p className="mt-2 text-sm text-emerald-700">Custom thumbnail applied to YouTube.{!published && ' Review it with the video and copy before approving publication.'}</p>
    </> : <p className="mt-2 text-sm text-slate-600">
      {status==='generating'?'Creating the custom thumbnail…':status==='failed'?'Thumbnail needs attention.':'Thumbnail queued. Make checks for new uploads every 15 minutes.'}
      {!published && ' Publishing approval unlocks when the thumbnail is ready.'}
    </p>}
    {error && <p className="mt-2 text-sm text-rose-700" role="alert">{error}</p>}
    {status==='failed' && <button className="btn-secondary mt-3" disabled={busy} onClick={retry}>{busy?'Queuing…':'Retry thumbnail'}</button>}
  </section>;
}
