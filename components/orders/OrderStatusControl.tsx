'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { STATUS_LABEL } from '@/lib/utils/format';
import type { OrderStatus } from '@/lib/supabase/database.types';

const FLOW: OrderStatus[] = ['draft','booked','scheduled','shooting','uploaded','processing','editing','ready','delivered','cancelled'];
export function OrderStatusControl({orderId,status}:{orderId:string;status:OrderStatus}) {
  const router=useRouter();
  const [pending,start]=useTransition();const [error,setError]=useState('');const [next,setNext]=useState(status);
  function save(){
    setError('');start(async()=>{
      const supabase=createClient();const {error:failure}=await supabase.from('orders').update({status:next}).eq('id',orderId);
      if(failure){setError('Status could not be updated. Please try again.');return;}
      void fetch(`/api/orders/${orderId}/sync-calendar`,{method:'POST'}).catch(()=>{});router.refresh();
    });
  }
  return <div className="space-y-2"><div className="flex flex-wrap items-end gap-3">
    <label className="min-w-40 flex-1 text-sm font-medium text-slate-700">Order status<select className="input mt-2" value={next} disabled={pending} onChange={e=>setNext(e.target.value as OrderStatus)}>{FLOW.map(s=><option value={s} key={s}>{STATUS_LABEL[s]||s}</option>)}</select></label>
    <button className="btn-secondary min-h-11" disabled={pending||next===status} onClick={save}>{pending?'Updating…':'Update status'}</button>
  </div><p className="text-xs text-slate-500">Changing the status does not send a delivery. Use the Delivery tab to preview and notify the client.</p>{error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}</div>;
}
