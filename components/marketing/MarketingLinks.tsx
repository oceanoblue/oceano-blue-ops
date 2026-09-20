'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
export function MarketingLinks({token,locked,demo}:{token:string;locked:boolean;demo:boolean}) {
 const [site,setSite]=useState<string|null>(demo?'/property/demo':null);
 useEffect(()=>{if(locked||demo)return;let done=false;fetch(`/api/delivery/${token}/site`,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(!done)setSite(d?.url||null);}).catch(()=>{});return()=>{done=true;};},[token,locked,demo]);
 return <section id="gallery-marketing" className="mt-10 rounded-xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Market your listing</h2><p className="mt-2 text-sm text-slate-600">Create a flyer or social post with your finished photos and contact details.</p>{locked?<p className="mt-4 text-sm text-amber-800">Complete payment to unlock marketing templates.</p>:<div className="mt-4 flex flex-wrap gap-3"><Link className="btn-primary" href={`/gallery/${token}/marketing`}>Create marketing materials</Link>{site&&<><Link className="btn-secondary" href={site}>Property website</Link><Link className="btn-secondary" href={`${site}?unbranded=1`}>Unbranded website</Link></>}</div>}</section>;
}
