"use client";

import { useEffect, useId, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import { localSessionDay, sessionMonthDays } from "@/lib/crm/scheduling-slots";

type MonthAvailability = {
    month: string;
    timezone: string;
    days: { date: string; slot_count: number }[];
    min_date: string;
    max_date: string;
};

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dateLabel = (day: string) => new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric",
}).format(new Date(`${day}T12:00:00Z`));

function moveMonth(month: string, offset: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date.toISOString().slice(0, 7);
}

export function SessionAvailabilityCalendar({ base, timezone, value, onChange, disabled = false }: {
    base: string;
    timezone: string;
    value: string;
    onChange: (day: string) => void;
    disabled?: boolean;
}) {
    const headingId = useId();
    const today = localSessionDay(new Date(), timezone);
    const [month, setMonth] = useState(() => today.slice(0, 7));
    const [data, setData] = useState<MonthAvailability | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        fetch(`${base}?month=${month}`, { cache: "no-store", signal: controller.signal })
            .then(async response => {
                const body = await response.json();
                if (!response.ok) throw new Error(body.error || "Unable to check the calendar.");
                if (!controller.signal.aborted) setData(body);
            })
            .catch(reason => {
                if (!controller.signal.aborted) {
                    setData(null);
                    setError(reason instanceof Error ? reason.message : "Unable to check the calendar.");
                }
            })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [base, month, retry]);

    // Opening a month immediately reveals the first day's real start times.
    // A selected date remains selected when that month's availability refreshes.
    useEffect(() => {
        if (loading || !data || data.month !== month) return;
        if (!data.days.some(day => day.date === value && day.slot_count > 0)) {
            const first = data.days.find(day => day.slot_count > 0)?.date ?? "";
            if (value !== first) onChange(first);
        }
    }, [data, loading, month, onChange, value]);

    const ready = !loading && !error && data?.month === month;
    const counts = new Map(ready ? data.days.map(day => [day.date, day.slot_count]) : []);
    const availableDays = ready ? data.days.filter(day => day.slot_count > 0) : [];
    const days = sessionMonthDays(month);
    const leadingDays = new Date(`${month}-01T12:00:00Z`).getUTCDay();
    const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00Z`));
    const canGoBack = month > (data?.min_date ?? today).slice(0, 7);
    const canGoForward = Boolean(data && month < data.max_date.slice(0, 7));

    function navigate(offset: number) {
        onChange("");
        setMonth(current => moveMonth(current, offset));
    }

    return <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-5 flex items-center justify-between gap-2">
            <h3 id={headingId} className="text-lg font-semibold text-ocean-950">{monthLabel}</h3>
            <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous month" disabled={disabled || loading || !canGoBack} onClick={() => navigate(-1)} className="grid h-10 w-10 place-items-center rounded-full text-slate-600 transition hover:bg-ocean-50 hover:text-ocean-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-600 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft aria-hidden="true" className="h-5 w-5" /></button>
                <button type="button" aria-label="Next month" disabled={disabled || loading || !canGoForward} onClick={() => navigate(1)} className="grid h-10 w-10 place-items-center rounded-full text-slate-600 transition hover:bg-ocean-50 hover:text-ocean-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-600 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight aria-hidden="true" className="h-5 w-5" /></button>
            </div>
        </div>
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400" aria-hidden="true">
            {weekdays.map(day => <span key={day} className="py-1">{day.slice(0, 2)}</span>)}
        </div>
        <div role="group" aria-labelledby={headingId} aria-busy={loading} className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingDays }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
            {days.map(date => {
                const count = counts.get(date) ?? 0;
                const available = ready && count > 0;
                const selected = available && date === value;
                return <button key={date} type="button" disabled={disabled || !available} onClick={() => { if (date !== value) onChange(date); }} aria-pressed={selected} aria-current={date === today ? "date" : undefined} aria-label={`${dateLabel(date)}, ${loading ? "checking availability" : error ? "availability unavailable" : available ? `${count} available ${count === 1 ? "time" : "times"}` : "unavailable"}`} className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-600 sm:min-h-12 ${selected ? "bg-ocean-800 font-semibold text-white shadow-sm" : available ? "bg-ocean-50 font-semibold text-ocean-900 hover:bg-ocean-100" : "cursor-default text-slate-300"}`}>
                    <span>{Number(date.slice(-2))}</span>
                    <span aria-hidden="true" className={`h-1 w-1 rounded-full ${selected ? "bg-white" : available ? "bg-ocean-500" : "bg-transparent"}`} />
                </button>;
            })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-ocean-500" />Available</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-200" />Unavailable</span>
        </div>
        <div aria-live="polite" className="mt-3 min-h-5 text-xs leading-relaxed text-slate-500">
            {loading ? <span className="inline-flex items-center gap-2"><LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />Checking available dates…</span> : error ? <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><p>{error}</p><button type="button" disabled={disabled} onClick={() => { onChange(""); setRetry(current => current + 1); }} className="mt-2 inline-flex min-h-9 items-center gap-2 font-semibold underline underline-offset-4"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />Try again</button></div> : availableDays.length ? `${availableDays.length} ${availableDays.length === 1 ? "date has" : "dates have"} room for your full session.` : <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-600">No available dates this month.</p>{canGoForward ? <button type="button" disabled={disabled} onClick={() => navigate(1)} className="mt-2 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-ocean-900">View next month<ArrowRight aria-hidden="true" className="h-4 w-4" /></button> : <p className="mt-1">Contact our office for more options.</p>}</div>}
        </div>
    </div>;
}
