import { billingSummary, money, type InvoiceOrder } from '@/lib/billing/ledger';
import { InvoiceTable } from './InvoiceTable';
import { fmtDateInTz } from '@/lib/utils/timezone';
export function InvoiceOverview({orders,staff=false}:{orders:InvoiceOrder[];staff?:boolean}) {
  const today=fmtDateInTz(new Date(),'America/New_York','iso');const summary=billingSummary(orders,today);
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3">{[['Outstanding',money(summary.outstanding)],['Overdue',money(summary.overdue)],['Awaiting pricing',summary.unpriced]].map(([title,value])=><div key={title} className="card p-5"><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div><InvoiceTable orders={orders} today={today} staff={staff}/></div>;
}
