import { requireTeamMember } from '@/lib/auth/require-team-member';
import { loadInvoices } from '@/lib/billing/load';
import { csvCell, invoiceStatus, balance } from '@/lib/billing/ledger';
import { reportPeriod } from '@/lib/billing/period';
import { fmtDateInTz } from '@/lib/utils/timezone';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const gate=await requireTeamMember();if(gate.error)return gate.error;
  const p=reportPeriod(new URL(request.url).searchParams.get('month')||undefined);const today=fmtDateInTz(new Date(),'America/New_York','iso');
  const inside=(date:string|null)=>Boolean(date&&Date.parse(date)>=Date.parse(p.start)&&Date.parse(date)<Date.parse(p.end));
  const orders=(await loadInvoices()).filter(o=>inside(o.created_at)||inside(o.download_paid_at));
  const rows:unknown[][]=[['Order','Client','Property','Status','Created','Due','Order total USD','Recorded payment USD','Paid at','Outstanding USD','Booked this month','Payment this month']];
  orders.forEach(o=>rows.push([o.order_number,o.clients?.full_name,o.listings?.address_line1,invoiceStatus(o,today),o.created_at,o.invoice_due_date,o.total_cents===null?'':(o.total_cents/100).toFixed(2),o.download_paid_cents===null?'':(o.download_paid_cents/100).toFixed(2),o.download_paid_at,(balance(o)/100).toFixed(2),inside(o.created_at)&&!['draft','cancelled'].includes(o.status)?'Yes':'No',inside(o.download_paid_at)?'Yes':'No']));
  return new Response('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="billing-${p.month}.csv"`,'Cache-Control':'private, no-store'}});
}
