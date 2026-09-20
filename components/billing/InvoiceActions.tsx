'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function InvoiceActions({ id, due, staff }: { id: string; due: string | null; staff: boolean }) {
  const [date,setDate]=useState(due||''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const router=useRouter();
  async function save() { setBusy(true);setMessage(''); try { const r=await fetch(`/api/invoices/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({due_date:date||null})}); if(!r.ok)throw new Error();setMessage('Due date saved.');router.refresh();} catch {setMessage('Unable to save due date. Please try again.');} finally{setBusy(false);} }
  return <div className="flex flex-wrap items-end gap-3 print:hidden"><button type="button" className="btn-secondary" onClick={()=>window.print()}>Print / Save PDF</button>{staff&&<><label className="text-sm">Due date<input type="date" className="input mt-1 block" value={date} disabled={busy} onChange={e=>setDate(e.target.value)} /></label><button className="btn-primary" disabled={busy} onClick={save}>{busy?'Saving…':'Save due date'}</button></>}{message&&<p role="status" className="text-sm">{message}</p>}</div>;
}
