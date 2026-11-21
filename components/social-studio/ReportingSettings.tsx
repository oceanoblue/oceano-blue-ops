"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MonthlyResult, ReportingMode } from "@/lib/social/reporting";
const options:Record<ReportingMode,string>={progress:"Production progress",client_managed:"Client manages performance reporting",agency_report:"Oceano Blue delivers a monthly performance report"};
export function ReportingSettings({program,initial,month,report,production}:{program:string;initial:ReportingMode;month:string;report:MonthlyResult|null;production:boolean}){
  const router=useRouter();
  const [mode,setMode]=useState(initial);
  const [url,setUrl]=useState(report?.report_url||"");
  const [source,setSource]=useState(report?.source||"");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function save(action:"mode"|"report"){
    setBusy(true);setMessage("");
    try{
      const body=action==="mode"?{action,program,mode}:{action,program,month,url,source};
      const res=await fetch("/api/social/results",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!res.ok) throw new Error((await res.json()).error||"Unable to save reporting settings.");
      setMessage("Saved.");router.refresh();
    }catch(err){setMessage(err instanceof Error?err.message:"Could not save.");}finally{setBusy(false);}
  }
  return <section className="card space-y-3 p-5"><h2 className="font-display text-lg font-semibold">Client reporting</h2>
    <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();void save("mode");}}>
      <label><span className="label">Performance reporting responsibility</span><select className="input" value={mode} onChange={e=>setMode(e.target.value as ReportingMode)}>{Object.entries(options).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
      <button disabled={!production||busy} className="btn-secondary">Save preference</button></form>
    {initial==="agency_report" && <form className="space-y-2" onSubmit={e=>{e.preventDefault();void save("report");}}>
      <h3 className="font-semibold">Performance report for {month}</h3>
      <label className="block"><span className="label">Source</span><input className="input" required maxLength={100} value={source} placeholder="Publishing platform or agency report" onChange={e=>setSource(e.target.value)}/></label>
      <label className="block"><span className="label">Client-facing report link</span><input className="input" type="url" required maxLength={1800} value={url} placeholder="https://" onChange={e=>setUrl(e.target.value)}/></label>
      <p className="text-xs text-slate-600">This link appears on this client’s progress page for the selected month.</p><button disabled={!production||busy} className="btn-secondary">Save monthly report</button></form>}
    {message&&<p role="status" className="text-sm">{message}</p>}
  </section>;
}
