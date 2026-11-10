'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ThumbnailPanel({episodeId, ready, published}:{episodeId:string;ready:boolean;published:boolean}) {
  const router=useRouter();
  const [status,setStatus]=useState(ready?'ready':'queued');
  const [url,setUrl]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

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
        
      }catch{if(active)setError('Could not load thumbnail status.');}
    };
    void load();
    const timer=setInterval(()=>void load(),15000);
    return ()=>{active=false;clearInterval(timer);};
  },[episodeId,router]);
  async function act(action:'retry'|'approve',file?:File){
    setBusy(true);setError(null);
    try{
      const form=new FormData();form.set('episode_id',episodeId);if(file)form.set('image',file);
      const res=await fetch('/api/podcasts/thumbnails',{method:'POST',headers:file?undefined:{'Content-Type':'application/json'},body:file?form:JSON.stringify({episode_id:episodeId,action})});
      const data=await res.json();
      if(!res.ok)setError(data.error);else{setStatus(file?'review':action==='approve'?'ready':'queued');setUrl(null);router.refresh();}
    }catch{setError('Could not retry. Please try again.');}finally{setBusy(false);}
  }
  return <section className="card p-5">
    <h2 className="font-semibold text-slate-900">YouTube thumbnail</h2>
    {['ready','review','applying'].includes(status) ? <>
      {url ? <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Episode thumbnail preview" className="mt-3 aspect-video w-full max-w-2xl rounded-lg object-contain" />
      </a> : <p className="mt-2 text-sm text-slate-600">Loading thumbnail preview…</p>}
      <p className="mt-2 text-sm text-emerald-700">{status==='ready'?'Custom thumbnail applied to YouTube.':status==='applying'?'Applying your approved thumbnail…':'Review the faces, names and headline before applying this design.'}</p>
    </> : <p className="mt-2 text-sm text-slate-600">
      {status==='generating'?'Creating the custom thumbnail…':status==='failed'?'Thumbnail needs attention.':'Thumbnail queued. Make checks for new uploads every two hours.'}
      {!published && ' Publishing approval unlocks when the thumbnail is ready.'}
    </p>}
    {error && <p className="mt-2 text-sm text-rose-700" role="alert">{error}</p>}
    {status==='failed' && <button className="btn-secondary mt-3" disabled={busy} onClick={()=>act('retry')}>{busy?'Queuing…':'Retry thumbnail'}</button>}
    {status==='review' && <div className="mt-3 flex gap-3"><button className="btn-primary" disabled={busy} onClick={()=>act('approve')}>{busy?'Applying…':'Approve thumbnail & apply to YouTube'}</button><button className="btn-secondary" disabled={busy} onClick={()=>act('retry')}>Regenerate design</button></div>}
    {!['generating','applying'].includes(status) && <label className="mt-4 block text-sm text-slate-700">Upload a replacement design (JPG or PNG, under 3 MB)
      <input type="file" accept="image/jpeg,image/png" disabled={busy} className="mt-2 block" onChange={e=>{const f=e.target.files?.[0];if(f)void act('retry',f);e.target.value='';}} />
    </label>}
  </section>;
}
