'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, endOfMonth, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { ScheduleData, AvailabilitySlot } from '@/lib/booking/types';
import { cn } from '@/lib/utils/cn';
import { fmtDateInTz, fmtTimeInTz } from '@/lib/utils/timezone';

const TIMEZONES: Record<string, string> = {
  'America/New_York': 'Eastern time',
  'America/Chicago': 'Central time',
  'America/Denver': 'Mountain time',
  'America/Los_Angeles': 'Pacific time',
};

export function ScheduleStep({
  schedule,
  totalDuration,
  productIds,
  zip,
  onBack,
  onComplete,
}: {
  schedule: ScheduleData;
  totalDuration: number;
  productIds: string;
  zip: string;
  onBack: () => void;
  onComplete: (s: ScheduleData) => void;
}) {
  const durationMinutes = totalDuration || schedule.duration_minutes;
  const [s, setS] = useState<ScheduleData>({
    ...schedule,
    duration_minutes: durationMinutes,
  });
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(s.scheduled_at ? new Date(s.scheduled_at) : new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(s.scheduled_at ? new Date(s.scheduled_at) : null);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [degraded, setDegraded] = useState(false);
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

  const activeRequest = useRef<AbortController | null>(null);
  const loadSlots = useCallback(() => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (!selectedDay) return;
    setLoading(true);
    setSlots(null);
    setDegraded(false);
    setError(false);
    // The chosen calendar cell is a date, independent of browser timezone.
    fetch(`/api/availability?date=${format(selectedDay, 'yyyy-MM-dd')}&duration=${durationMinutes}&products=${encodeURIComponent(productIds)}&zip=${encodeURIComponent(zip)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`status_${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (controller.signal.aborted) return;
        const availableSlots: AvailabilitySlot[] = d.slots ?? [];
        setSlots(availableSlots);
        setDegraded(Boolean(d.calendarDegraded));
        // Going back to this step should keep a time that is still available.
        setS(previous => {
          const selected = availableSlots.find(slot => slot.iso === previous.scheduled_at);
          return {
            ...previous,
            duration_minutes: durationMinutes,
            scheduled_at: selected?.iso ?? null,
            photographer_id: selected?.photographer_id ?? null,
          };
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSlots(null);
        setError(true);
        setS(previous => ({ ...previous, scheduled_at: null, photographer_id: null }));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [selectedDay, durationMinutes, productIds, zip]);

  useEffect(() => {
    loadSlots();
    return () => activeRequest.current?.abort();
  }, [loadSlots]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ocean-950">Choose a date and time</h1>
        <p className="mt-2 text-sm text-slate-600">Choose an available start time. You&apos;ll review your details before submitting.</p>
      </div>

      <div className="card grid min-w-0 gap-6 p-4 sm:grid-cols-2 sm:p-6">
        <div className="grid gap-4 border-b border-slate-200 pb-5 text-sm sm:col-span-2 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              <Clock className="h-3 w-3" aria-hidden="true" /> Selected time
            </div>
            {s.scheduled_at && <div className="mt-1 text-sm text-slate-600">{fmtDateInTz(s.scheduled_at, s.timezone)}</div>}
            <div className="mt-1 font-medium text-slate-800" aria-live="polite">
              {s.scheduled_at
                ? fmtTimeInTz(s.scheduled_at, s.timezone, { hour12: !hour24 }) +
                  ' – ' +
                  fmtTimeInTz(
                    new Date(new Date(s.scheduled_at).getTime() + durationMinutes * 60000),
                    s.timezone,
                    { hour12: !hour24 }
                  )
                : 'Choose a date and time below'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Estimated time on site</div>
            <div className="mt-1">{durationMinutes} minutes</div>
          </div>
          <div className="min-w-0">
            <label htmlFor="appointment-timezone" className="text-xs uppercase tracking-wide text-slate-500">Show times in</label>
            <select
              id="appointment-timezone" className="input mt-1 text-base sm:text-sm"
              value={s.timezone}
              onChange={(e) => setS({ ...s, timezone: e.target.value })}
            >
              {Object.entries(TIMEZONES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="btn-ghost min-h-11 min-w-11 p-2" disabled={monthCursor <= startOfMonth(today)} onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <h2 className="font-medium" aria-live="polite">{format(monthCursor, 'MMMM yyyy')}</h2>
            <button type="button" className="btn-ghost min-h-11 min-w-11 p-2" onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
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
              const selected = Boolean(selectedDay && isSameDay(d, selectedDay));
              const disabled = !inMonth || inPast;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={disabled}
                  aria-label={format(d, 'EEEE, MMMM d, yyyy')}
                  aria-pressed={selected}
                  aria-current={isSameDay(d, today) ? 'date' : undefined}
                  onClick={() => {
                    if (selected) return;
                    setSelectedDay(d);
                    setS(previous => ({ ...previous, scheduled_at: null, photographer_id: null }));
                  }}
                  className={cn(
                    'aspect-square min-h-10 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500 focus-visible:ring-offset-2',
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

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">{selectedDay ? format(selectedDay, 'EEE, MMM d') : 'Available start times'}</h2>
              <p className="mt-1 text-xs text-slate-500">{TIMEZONES[s.timezone] ?? s.timezone}</p>
            </div>
            <div role="group" aria-label="Time format" className="flex items-center text-xs rounded-md bg-slate-100 p-0.5">
              <button
                type="button" aria-label="12-hour time" aria-pressed={!hour24}
                className={`min-h-10 min-w-10 rounded-sm px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500 ${!hour24 ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                onClick={() => setHour24(false)}
              >
                12h
              </button>
              <button
                type="button" aria-label="24-hour time" aria-pressed={hour24}
                className={`min-h-10 min-w-10 rounded-sm px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500 ${hour24 ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                onClick={() => setHour24(true)}
              >
                24h
              </button>
            </div>
          </div>
          <div role="group" aria-label="Available start times" aria-live="polite" aria-busy={loading} className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-1">
            {degraded && <p className="col-span-full text-sm text-amber-800">We can&apos;t check all available times right now. Choose a listed time or contact us for help.</p>}
            {!selectedDay ? (
              <p className="col-span-full text-sm text-slate-500">Select a date to see available times.</p>
            ) : loading ? (
              <p className="col-span-full text-sm text-slate-500">Loading available times…</p>
            ) : error ? (
              <div className="col-span-full text-sm text-slate-500">
                <p>Couldn&apos;t load available times.</p>
                <button type="button" onClick={loadSlots} className="btn-secondary mt-2">
                  Try again
                </button>
              </div>
            ) : (slots?.length ?? 0) === 0 ? (
              <p className="col-span-full text-sm text-slate-500">No times are available. Try another date.</p>
            ) : (
              slots!.map((slot) => {
                const t = new Date(slot.iso);
                const active = s.scheduled_at === slot.iso;
                return (
                  <button
                    key={slot.iso}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setS({ ...s, scheduled_at: slot.iso, photographer_id: slot.photographer_id })}
                    className={cn(
                      'block min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500 focus-visible:ring-offset-2',
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
          <label htmlFor="access-method" className="label">Property access (optional)</label>
          <input
            className="input text-base sm:text-sm"
            id="access-method" maxLength={2000} placeholder="For example: meet the agent or use the side door"
            value={s.access_method}
            onChange={(e) => setS({ ...s, access_method: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="shoot-highlights" className="label">Features to highlight (optional)</label>
          <textarea
            className="input text-base sm:text-sm"
            id="shoot-highlights" rows={3} maxLength={5000}
            placeholder="Outdoor kitchen, primary suite, water views…"
            value={s.highlights}
            onChange={(e) => setS({ ...s, highlights: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>← Back to services</button>
        <button
          type="button"
          className="btn-primary"
          disabled={loading || !s.scheduled_at || !slots?.some(slot => slot.iso === s.scheduled_at && slot.photographer_id === s.photographer_id)}
          onClick={() => onComplete({ ...s, duration_minutes: durationMinutes })}
        >
          Continue to your details →
        </button>
      </div>
    </div>
  );
}
