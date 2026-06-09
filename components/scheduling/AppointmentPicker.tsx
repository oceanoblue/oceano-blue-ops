'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addDays, addMonths, isSameDay, isSameMonth,
  startOfMonth, startOfWeek, endOfMonth, endOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Globe, Eye, EyeOff } from 'lucide-react';
import { fmtTimeInTz, fmtDateInTz } from '@/lib/utils/timezone';
import { cn } from '@/lib/utils/cn';

interface AppointmentValue {
  scheduledAt: string | null;        // ISO
  photographerId: string | null;
  durationMinutes: number;
  timezone: string;
}

interface Photographer {
  id: string;
  full_name: string;
}

interface AvailabilitySlot {
  iso: string;
  photographer_id: string;
}

interface Props {
  value: AppointmentValue;
  onChange: (next: AppointmentValue) => void;
  photographers?: Photographer[];
  /**
   * When true, slots that conflict with existing bookings are still shown
   * (greyed out) and selectable. Internal staff use this to override.
   */
  allowOverride?: boolean;
}

const TIMEZONES = [
  { value: 'America/New_York', label: 'America/New York (EDT)' },
  { value: 'America/Chicago', label: 'America/Chicago (CDT)' },
  { value: 'America/Denver', label: 'America/Denver (MDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (PDT)' },
];

export function AppointmentPicker({ value, onChange, photographers, allowOverride }: Props) {
  const [monthCursor, setMonthCursor] = useState<Date>(() =>
    startOfMonth(value.scheduledAt ? new Date(value.scheduledAt) : new Date())
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(
    value.scheduledAt ? new Date(value.scheduledAt) : null
  );
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [hour24, setHour24] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);

  // Build the calendar grid for the visible month (starting Sunday).
  const calendarDays = useMemo(() => {
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

  // Fetch slots when selectedDay or duration changes
  useEffect(() => {
    if (!selectedDay) return;
    setLoading(true);
    setFetchError(false);
    const dateStr = fmtDateInTz(selectedDay, value.timezone, 'iso');
    fetch(`/api/availability?date=${dateStr}&duration=${value.durationMinutes}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => {
        // Distinguish "couldn't load" from a genuinely empty day.
        setSlots([]);
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, [selectedDay, value.durationMinutes, value.timezone]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Photographer name lookup for selected slot
  const selectedPhotographerName = useMemo(() => {
    if (!value.photographerId) return null;
    return photographers?.find((p) => p.id === value.photographerId)?.full_name ?? null;
  }, [value.photographerId, photographers]);

  // Build the full slot list for the selected day — every 30 min between business hours, marked as available/busy
  // For "show unavailable" we currently only show available slots from the API; busy slots not returned.
  // TODO: extend /api/availability to optionally return all slots with availability flag.

  function selectSlot(slot: AvailabilitySlot) {
    onChange({
      ...value,
      scheduledAt: slot.iso,
      photographerId: slot.photographer_id,
    });
  }

  return (
    <div className="card p-4 sm:p-6 grid gap-6 lg:grid-cols-[220px_1fr_280px]">
      {/* Left panel: recap */}
      <aside className="space-y-4 text-sm">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
            <Clock className="h-3 w-3" /> Selected time
          </div>
          <div className="mt-1 text-base font-medium">
            {value.scheduledAt
              ? fmtTimeInTz(value.scheduledAt, value.timezone, { hour12: !hour24 }) +
                ' – ' +
                fmtTimeInTz(
                  new Date(new Date(value.scheduledAt).getTime() + value.durationMinutes * 60000),
                  value.timezone,
                  { hour12: !hour24 }
                )
              : '— —'}
          </div>
          {value.scheduledAt && (
            <div className="text-xs text-slate-500">
              {fmtDateInTz(value.scheduledAt, value.timezone, 'long')}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Duration</div>
          <select
            className="input mt-1"
            value={value.durationMinutes}
            onChange={(e) =>
              onChange({ ...value, durationMinutes: +e.target.value, scheduledAt: null })
            }
          >
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
            <option value={75}>75 min</option>
            <option value={90}>90 min</option>
            <option value={120}>2 hours</option>
            <option value={180}>3 hours</option>
            <option value={240}>4 hours</option>
          </select>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
            <Globe className="h-3 w-3" /> Timezone
          </div>
          <select
            className="input mt-1"
            value={value.timezone}
            onChange={(e) => onChange({ ...value, timezone: e.target.value })}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
        {photographers && photographers.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Photographer</div>
            {selectedPhotographerName ? (
              <div className="mt-1 text-sm">
                Auto-assigned to <strong>{selectedPhotographerName}</strong>
              </div>
            ) : (
              <select
                className="input mt-1"
                value={value.photographerId ?? ''}
                onChange={(e) =>
                  onChange({ ...value, photographerId: e.target.value || null })
                }
              >
                <option value="">Auto-assign by slot</option>
                {photographers.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            )}
          </div>
        )}
        {allowOverride && (
          <button
            type="button"
            onClick={() => setShowUnavailable(!showUnavailable)}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-ocean-700"
          >
            {showUnavailable ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {showUnavailable ? 'Hiding nothing' : 'Show only available'}
          </button>
        )}
      </aside>

      {/* Middle: month calendar */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setMonthCursor(addMonths(monthCursor, -1))}
            aria-label="Previous month"
            className="p-1 rounded hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="font-medium text-ocean-900">
            {new Intl.DateTimeFormat('en-US', {
              timeZone: value.timezone,
              month: 'long',
              year: 'numeric',
            }).format(monthCursor)}
          </div>
          <button
            type="button"
            onClick={() => setMonthCursor(addMonths(monthCursor, 1))}
            aria-label="Next month"
            className="p-1 rounded hover:bg-slate-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs text-slate-500 mb-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((d) => {
            const inMonth = isSameMonth(d, monthCursor);
            const inPast = d < today;
            const selected = selectedDay && isSameDay(d, selectedDay);
            const isToday = isSameDay(d, today);
            const disabled = !inMonth || inPast;
            return (
              <button
                key={d.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedDay(d)}
                className={cn(
                  'aspect-square rounded-md text-sm transition',
                  disabled && 'text-slate-300 cursor-not-allowed',
                  !disabled && !selected && 'hover:bg-slate-100 text-slate-700',
                  selected && 'bg-ocean-700 text-white font-medium',
                  !selected && isToday && !disabled && 'ring-1 ring-ocean-300'
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: time slots */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">
            {selectedDay
              ? new Intl.DateTimeFormat('en-US', {
                  timeZone: value.timezone,
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                }).format(selectedDay)
              : 'Pick a date'}
          </div>
          <div className="flex items-center text-xs rounded-md bg-slate-100 p-0.5">
            <button
              type="button"
              className={cn(
                'px-2 py-0.5 rounded transition',
                !hour24 ? 'bg-slate-800 text-white' : 'text-slate-600'
              )}
              onClick={() => setHour24(false)}
            >
              12h
            </button>
            <button
              type="button"
              className={cn(
                'px-2 py-0.5 rounded transition',
                hour24 ? 'bg-slate-800 text-white' : 'text-slate-600'
              )}
              onClick={() => setHour24(true)}
            >
              24h
            </button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto pr-1 space-y-1.5">
          {!selectedDay ? (
            <p className="text-sm text-slate-500">Select a date to see times</p>
          ) : loading ? (
            <p className="text-sm text-slate-500">Loading slots…</p>
          ) : fetchError ? (
            <p className="text-sm text-rose-600">
              Couldn’t load availability — check your connection and reselect the day.
            </p>
          ) : (slots?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">
              No slots available — try another day or change duration.
            </p>
          ) : (
            slots!.map((slot) => {
              const active = value.scheduledAt === slot.iso;
              return (
                <button
                  key={slot.iso}
                  type="button"
                  onClick={() => selectSlot(slot)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition',
                    active
                      ? 'border-ocean-600 bg-ocean-50 text-ocean-900 font-medium'
                      : 'border-slate-200 hover:border-ocean-300 hover:bg-slate-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full',
                        active ? 'bg-ocean-600' : 'bg-emerald-500'
                      )}
                    />
                    {fmtTimeInTz(slot.iso, value.timezone, { hour12: !hour24 })}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
