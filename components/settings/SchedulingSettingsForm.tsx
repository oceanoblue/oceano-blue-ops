'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Settings {
  buffer_minutes: number;
  min_notice_hours: number;
  max_notice_days: number;
  default_timezone: string;
  business_name: string;
  raw_retention_days: number;
  assignment_timeout_minutes?: number;
  auto_confirm_bookings: boolean;
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

export function SchedulingSettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(initial);
  const [pending, start] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(initial);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  function save() {
    start(async () => {
      setError(null);
      setSavedAt(null);
      try {
      const supabase = createClient();
      const { error } = await supabase
        .from('business_settings')
        .upsert({ id: true, ...s }, { onConflict: 'id' });
      if (error) setError(error.message);
      else {
        setSavedAt(new Date().toLocaleTimeString());
        setSaved(s);
        router.refresh();
      }
      } catch {
        setError('Could not save. Your changes are still here; please try again.');
      }
    });
  }

  return (
    <section className="card p-6 max-w-2xl">
      <h2 className="font-semibold text-ocean-900">Booking & confirmation</h2>
      <p className="mt-1 text-sm text-slate-600">
        Choose how bookings are confirmed and when clients can book.
      </p>

      <div className="mt-6 space-y-5">
        <div className="rounded-xl border border-ocean-200 bg-ocean-50/60 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div><h3 id="auto-confirm-label" className="font-semibold text-ocean-950">Automatic confirmation</h3><p className="mt-1 text-xs font-medium text-ocean-700">{s.auto_confirm_bookings ? 'ON · Confirm immediately' : 'OFF · Require acceptance'}</p></div>
            <button type="button" role="switch" aria-checked={s.auto_confirm_bookings} aria-labelledby="auto-confirm-label" aria-describedby="auto-confirm-description" disabled={pending}
              onClick={() => setS({ ...s, auto_confirm_bookings: !s.auto_confirm_bookings })}
              className={`inline-flex min-h-11 w-14 shrink-0 items-center rounded-full p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ocean-600 disabled:opacity-50 ${s.auto_confirm_bookings ? 'bg-ocean-700' : 'bg-slate-400'}`}>
              <span className={`h-9 w-9 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${s.auto_confirm_bookings ? 'translate-x-3' : 'translate-x-0'}`} />
            </button>
          </div>
          <p id="auto-confirm-description" className="mt-3 text-sm text-slate-700">{s.auto_confirm_bookings ? 'Clients receive confirmation immediately. The assigned photographer is notified; no acceptance is required.' : 'The time is reserved while the assigned photographer accepts. Clients receive confirmation after acceptance. This includes Gustavo and contractors.'}</p>
          <p className="mt-3 border-t border-ocean-100 pt-3 text-xs leading-relaxed text-slate-600">Applies after saving to new bookings, reassignments, and reschedules. Existing assignments keep their current status. Availability checks and backup routing stay enabled.</p>
        </div>
        <label className="block text-sm">Photographer response window (minutes)<input className="input mt-2 max-w-xs" type="number" min={15} max={1440} value={s.assignment_timeout_minutes ?? 60} onChange={e=>setS({...s,assignment_timeout_minutes:Number(e.target.value)})}/><span className="mt-1 block text-xs text-slate-500">Used when automatic confirmation is OFF. For online bookings, a decline or timeout checks the next eligible photographer.</span></label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Buffer time (min)</label>
            <input
              type="number"
              min={0}
              max={240}
              className="input"
              value={s.buffer_minutes}
              onChange={(e) => setS({ ...s, buffer_minutes: Math.max(0, +e.target.value) })}
            />
            <p className="mt-1 text-xs text-slate-500">Gap between accepted shoots for travel + prep.</p>
          </div>
          <div>
            <label className="label">Minimum notice (hr)</label>
            <input
              type="number"
              min={0}
              max={168}
              className="input"
              value={s.min_notice_hours}
              onChange={(e) => setS({ ...s, min_notice_hours: Math.max(0, +e.target.value) })}
            />
            <p className="mt-1 text-xs text-slate-500">Earliest a client can book from now.</p>
          </div>
          <div>
            <label className="label">Maximum notice (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              className="input"
              value={s.max_notice_days}
              onChange={(e) => setS({ ...s, max_notice_days: Math.max(1, +e.target.value) })}
            />
            <p className="mt-1 text-xs text-slate-500">How far out clients can book.</p>
          </div>
        </div>

        <div>
          <label className="label">Default timezone</label>
          <select
            className="input max-w-xs"
            value={s.default_timezone}
            onChange={(e) => setS({ ...s, default_timezone: e.target.value })}
          >
            {TIMEZONES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Shown to clients in the booking flow when their device timezone isn&apos;t known.
          </p>
        </div>

        <div>
          <label className="label">Business name</label>
          <input
            className="input max-w-md"
            value={s.business_name}
            onChange={(e) => setS({ ...s, business_name: e.target.value })}
          />
        </div>

        <div className="border-t pt-5">
          <label className="label">RAW retention (days)</label>
          <input
            type="number"
            min={0}
            max={365}
            className="input max-w-xs"
            value={s.raw_retention_days ?? 30}
            onChange={(e) =>
              setS({ ...s, raw_retention_days: Math.max(0, +e.target.value) })
            }
          />
          <p className="mt-1 text-xs text-slate-500">
            Daily cron auto-deletes camera-RAW originals (ARW / CR2 / NEF / DNG) on delivered orders
            older than this. Converted JPEGs and processed photos always stay. Set to 0 to disable.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        {dirty && !pending && <span className="text-sm text-amber-700">Unsaved changes</span>}
        {savedAt && !dirty && <span role="status" className="text-sm text-emerald-700">Saved {savedAt}</span>}
        {error && <span role="alert" className="text-sm text-rose-700">{error}</span>}
      </div>
    </section>
  );
}
