'use client';
import { useEffect, useState } from 'react';
import { BookOpen, Download, Sparkles, X } from 'lucide-react';
const key = 'oceano-gallery-guide-v1';
const steps = [
  { title: 'Ready for MLS', icon: Download, text: 'Choose “Download Web / MLS ZIP” to save all your listing photos in a smaller size. Unzip the file before uploading to your MLS.' },
  { title: 'Need to print?', icon: Download, text: 'Choose “Download High-res ZIP” for the original delivered files. Use these for brochures, print and archiving. They take longer to download.' },
  { title: 'Make it your own', icon: Sparkles, text: 'Your property order includes 5 editing credits. Remove small clutter for 1 credit or virtually stage a room for 2. Choose a photo below. We review edits before releasing them, and your originals stay available.' },
];
export function GalleryGuide() {
  const [open,setOpen]=useState(false);
  const [step,setStep]=useState(0);
  useEffect(()=>{try {setOpen(localStorage.getItem(key)!=='seen');} catch {setOpen(true);}},[]);
  function close(){setOpen(false);try{localStorage.setItem(key,'seen');}catch{/* Storage can be disabled. */}}
  const Icon=steps[step].icon;
  return <section aria-label="Gallery quick guide" className="mb-6">
    <button type="button" className="btn-secondary" onClick={()=>{setStep(0);setOpen(v=>!v);}} aria-expanded={open}><BookOpen className="h-4 w-4"/> How to use your gallery</button>
    {open && <div className="relative mt-3 rounded-2xl border border-ocean-200 bg-white p-5 shadow-sm sm:p-6">
      <button type="button" onClick={close} aria-label="Close guide" className="absolute right-3 top-3 rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4"/></button>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ocean-700"><Icon className="h-4 w-4"/> Your gallery in 20 seconds · {step+1}/3</div>
      <div aria-live="polite"><h2 className="mt-3 text-xl font-semibold text-ocean-950">{steps[step].title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{steps[step].text}</p></div>
      <div className="mt-5 flex items-center gap-3"><button type="button" className="btn-primary" onClick={()=>step===2?close():setStep(s=>s+1)}>{step===2?'Explore my photos':'Next'}</button>{step>0 && <button type="button" className="btn-secondary" onClick={()=>setStep(s=>s-1)}>Back</button>}<button type="button" className="text-sm text-slate-500 underline" onClick={close}>Skip tutorial</button></div>
    </div>}
  </section>;
}
