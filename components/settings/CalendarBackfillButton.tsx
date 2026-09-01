'use client';

import { useState } from 'react';
import { Loader2, CalendarCheck } from 'lucide-react';

/** Pushes all upcoming shoots onto the office calendars (master + assignee). */
export function CalendarBackfillButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await fetch('/api/admin/calendar-backfill', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      setMsg(`Synced ${d.synced} of ${d.total} upcoming shoot${d.total === 1 ? '' : 's'} to the calendars.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={run} disabled={busy} className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
        Sync all shoots to calendar
      </button>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <p className="text-xs text-slate-500">
        Puts every upcoming shoot on the master (info@) calendar, plus a busy hold on the assigned
        photographer&rsquo;s own calendar. New bookings sync automatically.
      </p>
    </div>
  );
}
