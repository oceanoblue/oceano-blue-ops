'use client';

import Link from 'next/link';
import { useState } from 'react';
import { fmtCents, fmtDate } from '@/lib/utils/format';
import type { PaymentLine } from '@/lib/contractor-work/payment-ledger';

export function PaymentBreakdown({ items, filterable = true }: { items: PaymentLine[]; filterable?: boolean }) {
  const [status, setStatus] = useState('unpaid');
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const visible = items.filter(item => !filterable || (
    (status === 'all' || item.status === status) &&
    `${item.title} ${item.description} ${fmtDate(item.date)} ${item.paidNote ?? ''}`.toLowerCase().includes(search)
  ));
  return <div className="space-y-3">
    {filterable && <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-slate-600">Payment status
        <select className="input mt-1 block" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="unpaid">Unpaid ({items.filter(i => i.status === 'unpaid').length})</option>
          <option value="paid">Paid ({items.filter(i => i.status === 'paid').length})</option>
          <option value="all">All work ({items.length})</option>
        </select>
      </label>
      <label className="min-w-48 flex-1 text-xs font-medium text-slate-600">Find a shoot or event
        <input className="input mt-1 block w-full" value={query} onChange={e => setQuery(e.target.value)} placeholder="Address, event, date or payment reference" />
      </label>
    </div>}
    {visible.length === 0 ? <p className="py-3 text-sm text-slate-500">No {filterable && status !== 'all' ? `${status} ` : ''}work{search ? ' matches your search' : ' to show'}.</p> : <>
      <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {visible.map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link href={item.href} className="break-words font-medium text-ocean-700 hover:underline">{item.title}</Link>
            <p className="mt-1 text-xs text-slate-500">{item.date ? fmtDate(item.date) : 'Shoot date not recorded'} · {item.description}</p>
            {item.status === 'paid' && <p className="mt-1 break-words text-xs text-slate-600">
              {item.paidAt ? `Paid ${fmtDate(item.paidAt)}` : 'Marked paid; payment date not recorded'}
              {item.paidNote ? ` · ${item.paidNote}` : ''}
            </p>}
            {item.status === 'unpaid' && item.requestId && <p className="mt-1 text-xs text-amber-700">Included in a pay request</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold tabular-nums">{item.amountCents == null ? 'Amount not set' : fmtCents(item.amountCents)}</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${item.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{item.status === 'paid' ? 'Paid' : 'Unpaid'}</span>
          </div>
        </li>)}
      </ul>
      <p className="text-right text-xs text-slate-600">{visible.length} item{visible.length === 1 ? '' : 's'} · {fmtCents(visible.reduce((sum, item) => sum + (item.amountCents ?? 0), 0))}{visible.some(i => i.amountCents == null) ? ' + unset amounts' : ''}</p>
    </>}
  </div>;
}
