'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const DAYS = [
  { dow: 0, label: 'Sun' },
  { dow: 1, label: 'Mon' },
  { dow: 2, label: 'Tue' },
  { dow: 3, label: 'Wed' },
  { dow: 4, label: 'Thu' },
  { dow: 5, label: 'Fri' },
  { dow: 6, label: 'Sat' },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

interface AvailabilityRow {
  id?: string;
  team_member_id: string;
  day_of_week: number;
  start_local: string;
  end_local: string;
  timezone: string;
  is_active: boolean;
}

export function AvailabilityEditor({
  member,
  rows,
  canEdit,
}: {
  member: { id: string; full_name: string; role: string };
  rows: AvailabilityRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Record<number, AvailabilityRow | undefined>>(() => {
    const map: Record<number, AvailabilityRow | undefined> = {};
    for (const r of rows) map[r.day_of_week] = { ...r };
    return map;
  });
  const [tz, setTz] = useState(rows[0]?.timezone ?? 'America/New_York');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [error,setError]=useState('');

  function toggleDay(dow: number) {
    setDraft((d) => ({
      ...d,
      [dow]: d[dow]
        ? undefined
        : {
            team_member_id: member.id,
            day_of_week: dow,
            start_local: '09:00',
            end_local: '17:00',
            timezone: tz,
            is_active: true,
          },
    }));
  }

  function setField(dow: number, field: 'start_local' | 'end_local', value: string) {
    setDraft((d) => {
      const row = d[dow];
      if (!row) return d;
      return { ...d, [dow]: { ...row, [field]: value } };
    });
  }

  function save() {
    start(async () => {
      setError(''); setSavedAt(null);
      try {
        const rowsToInsert=Object.values(draft).filter((r):r is AvailabilityRow=>!!r).map(r=>({...r,timezone:tz}));
        const response=await fetch('/api/scheduling/hours',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({team_member_id:member.id,rows:rowsToInsert})});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||'Could not save hours.');
        setSavedAt(new Date().toLocaleTimeString()); router.refresh();
      } catch(e) { setError(e instanceof Error?e.message:'Could not save hours.'); }
    });
  }

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-ocean-900">{member.full_name}</h2>
          <p className="text-xs text-slate-500 capitalize">{member.role}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            {savedAt && <span className="text-xs text-emerald-700">Saved {savedAt}</span>}
            <select
              className="input w-auto text-sm"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
            >
              {TIMEZONES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button className="btn-primary text-sm" onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error&&<p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {DAYS.map(({ dow, label }) => {
          const row = draft[dow];
          const enabled = !!row;
          return (
            <li key={dow} className="flex flex-wrap items-center gap-3 py-3">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => toggleDay(dow)}
                className={cn(
                  'w-12 h-6 shrink-0 rounded-full transition',
                  enabled ? 'bg-ocean-700' : 'bg-slate-200'
                )}
                aria-label={`Toggle ${label}`}
              >
                <span
                  className={cn(
                    'block h-5 w-5 m-0.5 rounded-full bg-white shadow transition',
                    enabled ? 'translate-x-6' : ''
                  )}
                />
              </button>
              <div className="w-12 text-sm font-medium">{label}</div>
              {enabled ? (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    className="input w-28"
                    value={row.start_local.slice(0, 5)}
                    disabled={!canEdit}
                    onChange={(e) => setField(dow, 'start_local', e.target.value)}
                  />
                  <span className="text-slate-500">to</span>
                  <input
                    type="time"
                    className="input w-28"
                    value={row.end_local.slice(0, 5)}
                    disabled={!canEdit}
                    onChange={(e) => setField(dow, 'end_local', e.target.value)}
                  />
                </div>
              ) : (
                <span className="text-sm text-slate-400">Day off</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
