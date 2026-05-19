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

  function save() {
    start(async () => {
      setError(null);
      const supabase = createClient();
      const { error } = await supabase
        .from('business_settings')
        .upsert({ id: true, ...s }, { onConflict: 'id' });
      if (error) setError(error.message);
      else {
        setSavedAt(new Date().toLocaleTimeString());
        router.refresh();
      }
    });
  }

  return (
    <section className="card p-6 max-w-2xl">
      <h2 className="font-semibold text-ocean-900">Booking guards</h2>
      <p className="mt-1 text-sm text-slate-600">
        These apply org-wide. Clients won't see slots that violate them.
      </p>

      <div className="mt-6 space-y-5">
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
            Shown to clients in the booking flow when their device timezone isn't known.
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
        <button className="btn-primary" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        {savedAt && <span className="text-sm text-emerald-700">Saved {savedAt}</span>}
        {error && <span className="text-sm text-rose-700">{error}</span>}
      </div>
    </section>
  );
}
