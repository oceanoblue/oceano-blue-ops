'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CalendarClock, Check, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** Edit an order's shoot date/time. Updates scheduled_at, moves the calendar
 *  event(s), and — when the new time overlaps a photographer's travel buffer —
 *  lets staff override with a confirmation (public bookings still respect it). */
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
  const [needsOverride, setNeedsOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(allowOverlap = false) {
    if (!value) {
      setError('Pick a date & time.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const iso = new Date(value).toISOString();
      const supabase = createClient();
      const { error: err } = await (supabase as any).rpc('set_order_schedule', {
        p_order_id: orderId,
        p_scheduled_at: iso,
        p_allow_overlap: allowOverlap,
      });
      if (err) {
        const conflict =
          (err as any).code === '23P01' || /slot_unavailable|exclusion/i.test(err.message || '');
        if (conflict && !allowOverlap) {
          setNeedsOverride(true); // offer the buffer override
          return;
        }
        throw new Error(
          conflict ? 'That photographer is already booked around this time.' : err.message
        );
      }
      // Move the shoot on the calendars.
      await fetch(`/api/orders/${orderId}/sync-calendar`, { method: 'POST' }).catch(() => {});
      setOpen(false);
      setNeedsOverride(false);
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
          setNeedsOverride(false);
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          className="input h-9 w-auto py-1 text-sm"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNeedsOverride(false);
          }}
        />
        {!needsOverride && (
          <>
            <button
              onClick={() => save(false)}
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
          </>
        )}
      </div>

      {needsOverride && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-start gap-1.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This time overlaps the travel buffer with another of this photographer&rsquo;s shoots.
            Book it anyway?
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => save(true)}
              disabled={busy}
              className="btn-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Book anyway
            </button>
            <button onClick={() => setNeedsOverride(false)} className="btn-ghost text-sm">
              Pick another time
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

/** Format a stored UTC instant as YYYY-MM-DDTHH:mm in the viewer's local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
