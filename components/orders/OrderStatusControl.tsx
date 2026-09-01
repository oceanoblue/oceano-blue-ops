'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';
import type { OrderStatus } from '@/lib/supabase/database.types';

const FLOW: OrderStatus[] = [
  'draft', 'booked', 'scheduled', 'shooting', 'uploaded',
  'processing', 'editing', 'ready', 'delivered',
];

export function OrderStatusControl({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function setStatus(next: OrderStatus) {
    start(async () => {
      const supabase = createClient();
      await supabase.from('orders').update({ status: next }).eq('id', orderId);
      // Status change may add/remove the shoot on the calendars (e.g. cancel
      // clears it). Fire-and-forget.
      fetch(`/api/orders/${orderId}/sync-calendar`, { method: 'POST' }).catch(() => {});
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {FLOW.map((s) => (
        <button
          key={s}
          disabled={pending || s === status}
          onClick={() => setStatus(s)}
          className={`pill border transition ${
            s === status
              ? `${STATUS_COLOR[s]} border-transparent ring-2 ring-ocean-300`
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
