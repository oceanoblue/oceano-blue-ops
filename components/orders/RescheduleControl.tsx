'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CalendarClock, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** Edit an order's shoot date/time. Updates scheduled_at, respects the
 *  double-book guard, and moves the calendar event(s) via the sync route. */
export function RescheduleControl({
  orderId,
  scheduledAt,
}: {
  orderId: string;
  scheduledAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => toLocalInput(scheduledAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!value) {
      setError('Pick a date & time.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const iso = new Date(value).toISOString();
      const supabase = createClient();
      const { error: err } = await (supabase.from('orders') as any)
        .update({ scheduled_at: iso })
        .eq('id', orderId);
      if (err) {
        const conflict = (err as any).code === '23P01' || /slot_unavailable/i.test(err.message);
        throw new Error(
          conflict ? 'That photographer is already booked around this time.' : err.message
        );
      }
      // Move the shoot on the calendars.
      await fetch(`/api/orders/${orderId}/sync-calendar`, { method: 'POST' }).catch(() => {});
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setValue(toLocalInput(scheduledAt));
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 text-sm text-ocean-700 transition hover:text-ocean-800"
      >
        <CalendarClock className="h-4 w-4" />
        {scheduledAt ? 'Change date/time' : 'Set date/time'}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        className="input h-9 w-auto py-1 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        onClick={save}
        disabled={busy}
        className="btn-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
      </button>
      <button
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="btn-ghost text-sm"
      >
        Cancel
      </button>
      {error && <span className="w-full text-xs text-rose-600">{error}</span>}
    </div>
  );
}

/** Format a stored UTC instant as a YYYY-MM-DDTHH:mm string in the viewer's
 *  local time for the datetime-local input (round-trips in the office tz). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
