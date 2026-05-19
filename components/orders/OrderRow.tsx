'use client';

import { useRouter } from 'next/navigation';
import { fmtDateTime, fmtAddress, STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';

interface OrderRowProps {
  order: any;
}

export function OrderRow({ order: o }: OrderRowProps) {
  const router = useRouter();
  const href = `/dashboard/orders/${o.id}`;

  return (
    <tr
      onClick={() => router.push(href)}
      onMouseEnter={() => router.prefetch(href)}
      className="hover:bg-slate-50 cursor-pointer transition"
    >
      <td className="px-4 py-3">
        <span className="font-medium text-ocean-800">#{o.order_number}</span>
        {o.rush && <span className="ml-2 pill bg-rose-100 text-rose-700">RUSH</span>}
      </td>
      <td className="px-4 py-3 text-slate-700">
        {o.listings ? fmtAddress(o.listings) : '—'}
      </td>
      <td className="px-4 py-3 text-slate-700">
        <div>{o.clients?.full_name ?? '—'}</div>
        <div className="text-xs text-slate-500">{o.clients?.brokerage ?? ''}</div>
      </td>
      <td className="px-4 py-3 text-slate-700">{fmtDateTime(o.scheduled_at)}</td>
      <td className="px-4 py-3">
        <span className={`pill ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
      </td>
    </tr>
  );
}
