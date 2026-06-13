'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, endOfMonth, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { ScheduleData, AvailabilitySlot } from '@/lib/booking/types';
import { cn } from '@/lib/utils/cn';
import { fmtTimeInTz, fmtDateInTz } from '@/lib/utils/timezone';

export function ScheduleStep({
  schedule,
  totalDuration,
  onBack,
  onComplete,
}: {
  schedule: ScheduleData;
  totalDuration: number;
  onBack: () => void;
  onComplete: (s: ScheduleData) => void;
}) {
  const [s, setS] = useState<ScheduleData>({
    ...schedule,
    duration_minutes: totalDuration || schedule.duration_minutes,
  });
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(s.scheduled_at ? new Date(s.scheduled_at) : new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(s.scheduled_at ? new Date(s.scheduled_at) : null);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hour24, setHour24] = useState(false);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 0 });
    const arr: Date[] = [];
    let cur = start;
    while (cur <= end) {
      arr.push(cur);
      cur = addDays(cur, 1);
    }
    return arr;
  }, [monthCursor]);

  const loadSlots = useCallback(() => {
    if (!selectedDay) return;
    setLoading(true);
    setError(false);
    // Send the date as YYYY-MM-DD in the TEAM timezone, not browser-local
    fetch(`/api/availability?date=${fmtDateInTz(selectedDay, s.timezone, 'iso')}&duration=${s.duration_minutes}`)
      .then((r) => {
        if (!r.ok) throw new Error(`status_${r.status}`);
        return r.json();
      })
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => {
        setSlots(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  // re-run when the date changes, the picked duration, or the timezone changes
  }, [selectedDay, s.duration_minutes, s.timezone]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ocean-950">Schedule your appointment</h1>
        <p className="text-sm text-slate-600">Let us know your preferred date and start time for the service</p>
      </div>

      <div className="card p-4 sm:p-6 grid gap-6 lg:grid-cols-[1fr_280px_320px]">
        {/* Left: selected time recap */}
        <div className="space-y-4 text-sm">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              <Clock className="h-3 w-3" /> Selected time
            </div>
            <div className="mt-1 text-base">
              {s.scheduled_at
                ? fmtTimeInTz(s.scheduled_at, s.timezone, { hour12: !hour24 }) +
                  ' – ' +
                  fmtTimeInTz(
                    new Date(new Date(s.scheduled_at).getTime() + s.duration_minutes * 60000),
                    s.timezone,
                    { hour12: !hour24 }
                  )
                : '— —'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Appointment duration</div>
            <div className="mt-1">{s.duration_minutes} min</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Timezone</div>
            <select
              className="input mt-1"
              value={s.timezone}
              onChange={(e) => setS({ ...s, timezone: e.target.value })}
            >
              <option value="America/New_York">America/New York (EDT)</option>
              <option value="America/Chicago">America/Chicago (CDT)</option>
              <option value="America/Denver">America/Denver (MDT)</option>
              <option value="America/Los_Angeles">America/Los Angeles (PDT)</option>
            </select>
          </div>
        </div>

        {/* Middle: month calendar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="font-medium">{format(monthCursor, 'MMMM yyyy')}</div>
            <button onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-slate-500">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const inMonth = isSameMonth(d, monthCursor);
              const inPast = d < today;
              const selected = selectedDay && isSameDay(d, selectedDay);
              const disabled = !inMonth || inPast;
              return (
                <button
                  key={d.toISOString()}
                  disabled={disabled}
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    'aspect-square rounded-md text-sm',
                    disabled && 'text-slate-300 cursor-not-allowed',
                    !disabled && !selected && 'hover:bg-slate-100 text-slate-700',
                    selected && 'bg-ocean-700 text-white font-medium'
                  )}
                >
                  {format(d, 'd')}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: time slots */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">
              {selectedDay ? format(selectedDay, 'EEE, MMM d') : 'Pick a date'}
            </div>
            <div className="flex items-center text-xs rounded-md bg-slate-100 p-0.5">
              <button
                className={`px-2 py-0.5 rounded ${!hour24 ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                onClick={() => setHour24(false)}
              >
                12h
              </button>
              <button
                className={`px-2 py-0.5 rounded ${hour24 ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                onClick={() => setHour24(true)}
              >
                24h
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto pr-1 space-y-1">
            {!selectedDay ? (
              <p className="text-sm text-slate-500">Select a date to see times</p>
            ) : loading ? (
              <p className="text-sm text-slate-500">Loading slots…</p>
            ) : error ? (
              <div className="text-sm text-slate-500">
                <p>Couldn&apos;t load available times.</p>
                <button onClick={loadSlots} className="btn-secondary mt-2">
                  Try again
                </button>
              </div>
            ) : (slots?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">No slots available — try another day.</p>
            ) : (
              slots!.map((slot) => {
                const t = new Date(slot.iso);
                const active = s.scheduled_at === slot.iso;
                return (
                  <button
                    key={slot.iso}
                    onClick={() => setS({ ...s, scheduled_at: slot.iso, photographer_id: slot.photographer_id })}
                    className={cn(
                      'block w-full rounded-md border px-3 py-2 text-sm text-left',
                      active
                        ? 'border-ocean-600 bg-ocean-50 text-ocean-900 font-medium'
                        : 'border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {fmtTimeInTz(t, s.timezone, { hour12: !hour24 })}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="card p-4 sm:p-6 space-y-4">
        <div>
          <label className="label">How will we access the property?</label>
          <input
            className="input"
            placeholder="Lockbox code 1234, side door"
            value={s.access_method}
            onChange={(e) => setS({ ...s, access_method: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Is there anything specific you want highlighted?</label>
          <textarea
            className="input"
            rows={3}
            placeholder="Outdoor kitchen, primary suite, water views…"
            value={s.highlights}
            onChange={(e) => setS({ ...s, highlights: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-between">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <button
          className="btn-primary"
          disabled={!s.scheduled_at}
          onClick={() => onComplete(s)}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
