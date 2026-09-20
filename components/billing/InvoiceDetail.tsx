import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { requireClientIds } from '@/lib/portal/require-client';
import { invoiceSelect } from '@/lib/billing/load';
import { invoiceStatus, balance, money, type InvoiceOrder } from '@/lib/billing/ledger';
import { InvoiceActions } from './InvoiceActions';
import { fmtDateInTz } from '@/lib/utils/timezone';
export async function InvoiceDetail({id,staff}: {id:string;staff:boolean}) {
  const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/portal');
  let query=(db as any).from('orders').select(invoiceSelect).eq('id',id);
  if(staff){const gate=await requireTeamMember();if(gate.error)notFound();}
  else {const ids=await requireClientIds(db,user.id);if(!ids.length)notFound();query=query.in('client_id',ids);}
  const {data,error}=await query.maybeSingle();if(error)throw new Error('Invoice unavailable. Please refresh.');if(!data)notFound();
  const o=data as InvoiceOrder; const today=fmtDateInTz(new Date(),'America/New_York','iso');
  const {data:links}=await createAdminClient({noStore:true}).from('delivery_links').select('token,expires_at').eq('order_id',id).order('created_at',{ascending:false});
  const link=links?.find(l=>!l.expires_at||Date.parse(l.expires_at)>Date.now());
  const itemTotal=o.order_items.reduce((n,i)=>n+i.total_cents,0);
  return <main className="invoice-sheet mx-auto max-w-3xl space-y-6 p-6 sm:p-10"><Link className="text-sm text-ocean-700 underline print:hidden" href={`${staff?'/dashboard':'/portal'}/invoices`}>← All invoices</Link>
    <div className="flex flex-wrap justify-between gap-4"><div><p className="font-semibold text-ocean-800">OCEANO BLUE MEDIA</p><h1 className="mt-4 text-3xl font-semibold">Invoice #{o.order_number}</h1><p className="mt-2 text-slate-600">{invoiceStatus(o,today)}</p></div><div className="text-sm text-slate-600"><p>Created: {o.created_at.slice(0,10)}</p><p>Due: {o.invoice_due_date||'Not set'}</p>{o.download_paid_at&&<p>Paid: {fmtDateInTz(o.download_paid_at,'America/New_York','short')}</p>}</div></div>
    <div className="rounded-xl bg-slate-50 p-5"><p className="text-xs uppercase text-slate-500">Bill to</p><p className="mt-1 font-medium">{o.clients?.full_name}</p><p className="text-sm">{o.clients?.email}</p><p className="mt-3 text-sm">{o.listings?.address_line1}</p></div>
    <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-3">Description</th><th className="py-3 text-right">Qty</th><th className="py-3 text-right">Amount</th></tr></thead><tbody>{o.order_items.map((item,i)=><tr key={i} className="border-b border-slate-100"><td className="py-3">{item.description}</td><td className="py-3 text-right">{item.quantity}</td><td className="py-3 text-right">{money(item.total_cents)}</td></tr>)}{!o.order_items.length&&<tr><td className="py-4" colSpan={2}>Media services — Order #{o.order_number}</td><td className="text-right">{money(o.total_cents)}</td></tr>}{o.order_items.length>0&&o.total_cents!==null&&itemTotal!==o.total_cents&&<tr><td className="py-3" colSpan={2}>Order adjustments</td><td className="text-right">{money(o.total_cents-itemTotal)}</td></tr>}</tbody></table>
    <div className="ml-auto max-w-sm space-y-2"><p className="flex justify-between"><span>Total</span><strong>{money(o.total_cents)}</strong></p>{o.download_paid_at&&<p className="flex justify-between text-sm"><span>Recorded payment</span><span>{money(o.download_paid_cents)}</span></p>}<p className="flex justify-between border-t pt-3 text-xl"><span>Balance</span><strong>{o.total_cents===null&&!o.download_paid_at?'Not priced':money(balance(o))}</strong></p></div>
    {!staff&&balance(o)>0&&(link?<Link className="btn-primary print:hidden" href={`/gallery/${encodeURIComponent(link.token)}`}>Open gallery & pay</Link>:<p className="text-sm">Contact our team for a payment link.</p>)}
    <InvoiceActions id={id} due={o.invoice_due_date} staff={staff} />
    <p className="text-xs text-slate-500">Questions about this invoice? Contact Oceano Blue Media and reference order #{o.order_number}.</p>
  </main>;
}
