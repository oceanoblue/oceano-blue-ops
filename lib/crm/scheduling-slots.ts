import { localToUtc } from "@/lib/utils/timezone";
import type { SessionType } from "./scheduling-types";
export type SessionRange = {
    start: string;
    end: string;
};
const parts = (date: Date, timezone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map(p => [p.type, p.value]));
export function localSessionDay(date: Date, timezone: string) { const p = parts(date, timezone); return `${p.year}-${p.month}-${p.day}`; }
export function validSessionDay(day: string) { return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day; }
export function sessionMonthHorizon(today:string,months:number) {
    const [y,m,d]=today.split("-").map(Number),target=new Date(Date.UTC(y,m-1+months,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
    return new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),Math.min(d,last))).toISOString().slice(0,10);
}
export function sessionSlots(type: SessionType, day: string, busy: SessionRange[], now = new Date()): string[] {
    if (!validSessionDay(day))
        return [];
    const today = localSessionDay(now, type.timezone);
    const horizon = new Date(`${today}T12:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + type.horizon_days);
    const lastDay=type.booking_horizon_months?sessionMonthHorizon(today,type.booking_horizon_months):horizon.toISOString().slice(0,10);
    if (day < today || day > lastDay)
        return [];
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    const ranges = busy.map(r => ({ start: Date.parse(r.start), end: Date.parse(r.end) }));
    const slots = new Set<string>();
    for (const window of type.availability.filter(w => w.day === dow)) {
        const from = Number(window.start.slice(0, 2)) * 60 + Number(window.start.slice(3)), to = Number(window.end.slice(0, 2)) * 60 + Number(window.end.slice(3));
        for (let minute = from; minute + type.duration_minutes <= to; minute += type.slot_interval_minutes??15) {
            const hhmm = `${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
            let start = localToUtc(day, hhmm, type.timezone);
            // Resolve against the target instant too: the offset can change between
            // the UTC guess and this wall time on a daylight-saving transition day.
            for (let attempt = 0; attempt < 3; attempt++) {
                const observed = parts(start, type.timezone);
                const target = Date.parse(`${day}T${hhmm}:00Z`), actual = Date.parse(`${observed.year}-${observed.month}-${observed.day}T${observed.hour}:${observed.minute}:00Z`);
                if (target === actual)
                    break;
                start = new Date(start.getTime() + target - actual);
            }
            const check = parts(start, type.timezone);
            // Spring-forward wall times that never existed cannot be booked.
            if (`${check.year}-${check.month}-${check.day}` !== day || `${check.hour}:${check.minute}` !== hhmm)
                continue;
            const end = start.getTime() + type.duration_minutes * 60000;
            if (start.getTime() < now.getTime() + type.notice_minutes * 60000)
                continue;
            const before = start.getTime() - (type.buffer_before_minutes??type.buffer_minutes) * 60000, after = end + (type.buffer_after_minutes??type.buffer_minutes) * 60000;
            if (ranges.some(r => before < r.end && after > r.start))
                continue;
            // A DST transition must not extend the meeting outside its wall-clock window.
            const ending = parts(new Date(end), type.timezone);
            if (`${ending.year}-${ending.month}-${ending.day}` !== day || `${ending.hour}:${ending.minute}` > window.end)
                continue;
            slots.add(start.toISOString());
        }
    }
    return [...slots].sort();
}
export function sessionCalendarFile(a: Pick<import("./scheduling-types").Appointment, "id" | "title" | "starts_at" | "ends_at" | "location" | "status">): string {
    const escape = (v: string) => v.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, m => `\\${m}`);
    const utc = (v: string) => new Date(v).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Oceano Blue//Ops Sessions//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${a.id}@app.oceanoblue.net`, `DTSTAMP:${utc(new Date().toISOString())}`, `DTSTART:${utc(a.starts_at)}`, `DTEND:${utc(a.ends_at)}`, `SUMMARY:${escape(a.title)}`, `LOCATION:${escape(a.location)}`, `STATUS:${a.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
