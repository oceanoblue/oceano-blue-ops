'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CalendarClock, Check, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { scheduleInput, scheduleWindow } from '@/lib/orders/schedule-window';

/** Edit an order's shoot date/time. Updates scheduled_at, moves the calendar
 *  event(s), and — when the new time overlaps a photographer's travel buffer —
 *  lets staff override with a confirmation (public bookings still respect it). */
export function RescheduleControl({
  orderId,
  scheduledAt,
  durationMinutes,
  timezone = 'America/New_York',
}: {
  orderId: string;
  scheduledAt: string | null;
  durationMinutes: number;
  timezone?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const endAt = scheduledAt ? new Date(Date.parse(scheduledAt) + durationMinutes * 60000).toISOString() : null;
  const [value, setValue] = useState(() => scheduleInput(scheduledAt, timezone));
  const [end, setEnd] = useState(() => scheduleInput(endAt, timezone));
  const saving = useRef(false);
  const [syncWarning, setSyncWarning] = useState(false);
  let proposedMinutes: number | null = null;
  try { proposedMinutes = scheduleWindow(value, end, timezone).duration; } catch { /* Incomplete input. */ }
  const [busy, setBusy] = useState(false);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(allowOverlap = false) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const window = scheduleWindow(value, end, timezone);
      const supabase = createClient();
      const { error: err } = await (supabase as any).rpc('set_order_schedule_window', {
        p_order_id: orderId,
        p_scheduled_at: window.scheduledAt,
        p_ends_at: window.endsAt,
        p_previous_scheduled_at: scheduledAt,
        p_previous_duration: durationMinutes,
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
          conflict ? 'That photographer is already booked around this time.' :
          err.message?.includes('order_changed') ? 'This appointment changed in another window. Refresh the page before editing again.' : err.message
        );
      }
      // Move the shoot on the calendars.
      const synced = await fetch(`/api/orders/${orderId}/sync-calendar`, { method: 'POST' }).then(r => r.ok).catch(() => false);
      setSyncWarning(!synced);
      setOpen(false);
      setNeedsOverride(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-2"><button
        onClick={() => {
          setValue(scheduleInput(scheduledAt, timezone));
          setEnd(scheduleInput(endAt, timezone));
          setError(null);
          setNeedsOverride(false);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 text-sm text-ocean-700 transition hover:text-ocean-800"
      >
        <CalendarClock className="h-4 w-4" />
        {scheduledAt ? 'Edit appointment times' : 'Set appointment times'}
      </button>
      {syncWarning && <p role="alert" className="text-xs text-amber-800">Appointment saved, but calendar sync could not be confirmed. <button className="underline" disabled={busy} onClick={async () => { setBusy(true); const ok = await fetch(`/api/orders/${orderId}/sync-calendar`, { method: 'POST' }).then(r => r.ok).catch(() => false); setSyncWarning(!ok); setBusy(false); }}>Retry calendar sync</button></p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Appointment timezone: {timezone.replaceAll('_', ' ')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">From
          <input type="datetime-local" className="input mt-1 w-full min-w-0 text-sm" value={value} disabled={busy}
            onChange={(e) => { setValue(e.target.value); setNeedsOverride(false); setError(null); }} />
        </label>
        <label className="block text-sm font-medium">To
          <input type="datetime-local" className="input mt-1 w-full min-w-0 text-sm" value={end} disabled={busy}
            onChange={(e) => { setEnd(e.target.value); setNeedsOverride(false); setError(null); }} />
        </label>
      </div>
      <p className="text-xs text-slate-500">{proposedMinutes === null ? 'Choose the appointment window.' : `${proposedMinutes} minutes reserved.`} Services and pricing stay the same.</p>
      <p className="text-xs text-slate-500">Saving updates the connected calendars. Calendar guests may receive a time-change notification.</p>
      <div className="flex flex-wrap items-center gap-2">
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
              disabled={busy}
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
            This appointment overlaps another shoot or its travel buffer.
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
            <button disabled={busy} onClick={() => setNeedsOverride(false)} className="btn-ghost text-sm">
              Pick another time
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
