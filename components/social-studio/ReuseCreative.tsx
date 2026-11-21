"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { officeCreativeHref } from "@/lib/social/links";
type Piece={id:string;title:string;kind:string;slot:number;status:string;creative_path?:string|null;creative_type?:string|null;review_revision?:number};
export function ReuseCreative({items}:{items:Piece[]}){
  const router=useRouter();
  const groups=new Map<string,Piece[]>();
  for(const piece of items){if(piece.creative_path)groups.set(piece.creative_path,[...(groups.get(piece.creative_path)||[]),piece]);}
  const [source,setSource]=useState("");const [target,setTarget]=useState("");
  const [feedback,setFeedback]=useState("");const [busy,setBusy]=useState(false);
  const selected=items.find(i=>i.id===source);
  const eligible=items.filter(i=>i.id!==source && ["planned","needs_media","in_design","internal_review"].includes(i.status) &&
      (!selected||selected.creative_path!==i.creative_path) && (i.kind!=="reel"||selected?.creative_type?.startsWith("video/")));
  const title=(i:Piece)=>i.title||`${i.kind.replace("_"," ")} ${i.slot}`;
  if(groups.size===0)return null;
  return <section className="card space-y-3 p-5"><h2 className="font-display text-lg font-semibold">Creative used this month</h2>
    <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">{[...groups.values()].map(list=>{const first=list[0];const href=officeCreativeHref(first.id,first.review_revision??1);
      return <li key={first.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-ink-100">
        <a href={href} target="_blank" rel="noreferrer" className="block bg-ink-100" aria-label={`Open the creative for ${title(first)}`}>
          {first.creative_type?.startsWith("video/")
            ? <video src={href} muted playsInline preload="metadata" className="aspect-[4/5] w-full object-cover" />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={href} alt="" loading="lazy" decoding="async" className="aspect-[4/5] w-full object-cover" />}
        </a>
        <p className="px-3 py-2"><span className="block truncate font-medium text-ink-900">{title(first)}</span>
          <span className="block text-slate-500">{list.length===1?"Used once":`Used on ${list.length} pieces`}</span></p>
      </li>;})}</ul>
    <form className="space-y-2" onSubmit={async e=>{e.preventDefault();const dest=eligible.find(i=>i.id===target);
      if(!selected||!dest)return;setBusy(true);setFeedback("");
      try{const r=await fetch("/api/social/media/reuse",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({source,target,revision:dest.review_revision,source_revision:selected.review_revision})});
        if(!r.ok)throw new Error((await r.json()).error||"Could not attach the creative.");setFeedback("Creative attached.");setTarget("");router.refresh();
      }catch(err){setFeedback(err instanceof Error?err.message:"Could not attach the creative.");}finally{setBusy(false);}
    }}>
    <label className="block"><span className="label">Reuse a creative</span><select className="input" value={source} onChange={e=>{setSource(e.target.value);setTarget("");}}><option value="">Select source</option>{[...groups.values()].map(([p])=><option value={p.id} key={p.id}>{title(p)}</option>)}</select></label>
    {selected && <label className="block"><span className="label">Attach to a draft</span><select className="input" required value={target} onChange={e=>setTarget(e.target.value)}><option value="">Select piece</option>{eligible.map(p=><option value={p.id} key={p.id}>{title(p)}</option>)}</select></label>}
    {selected && <button type="submit" className="btn-secondary" disabled={!target||busy}>Attach creative</button>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}</form></section>;
}
