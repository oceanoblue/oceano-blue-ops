"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, MapPin, ArrowRight, CheckCircle2, Download } from "lucide-react";
import { sessionRequiresPhone,validSessionPhone,type PublicSessionType } from "@/lib/crm/scheduling-types";
import { localSessionDay } from "@/lib/crm/scheduling-slots";
type Managed = {
    appointment: {
        id: string;
        title: string;
        location: string;
        timezone: string;
        full_name: string;
        starts_at: string;
        ends_at: string;
        status: string;
        version: number;
    };
    slug: string;
    canReschedule: boolean;
};
function Location({ text }: {
    text: string;
}) {
    let link = false;
    try {
        const u = new URL(text);
        link = u.protocol === "https:" && !u.username && !u.password;
    }
    catch { /* Plain location. */ }
    return link ? <a className="underline underline-offset-4" href={text} target="_blank" rel="noopener noreferrer">{text}</a> : <span>{text}</span>;
}
export function SchedulingBooking({ type, readOnly, managed, token }: {
    type: PublicSessionType;
    readOnly: boolean;
    managed?: Managed;
    token?: string;
}) {
    const router = useRouter();
    const [day, setDay] = useState(() => localSessionDay(new Date(), type.timezone)), [slots, setSlots] = useState<string[]>([]), [selected, setSelected] = useState(""), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(""), [rescheduling, setRescheduling] = useState(false), [cancelConfirm, setCancelConfirm] = useState(false), [displayZone, setDisplayZone] = useState(type.timezone);
    const nonce = useRef<string | null>(null), pending = useRef(false);
    const base = token ? `/api/crm/scheduling/manage/${token}` : `/api/crm/scheduling/public/${type.slug}`;
    const showPicker = !managed || rescheduling;
    const phoneRequired=sessionRequiresPhone(type);
    useEffect(() => { setDisplayZone(Intl.DateTimeFormat().resolvedOptions().timeZone || type.timezone); }, [type.timezone]);
    useEffect(() => {
        if (!showPicker)
            return;
        const controller = new AbortController();
        setLoading(true);
        setSelected("");
        setError("");
        fetch(`${base}?date=${day}`, { cache: "no-store", signal: controller.signal }).then(async (r) => { const b = await r.json(); if (!r.ok)
            throw new Error(b.error); if (!controller.signal.aborted)
            setSlots(b.slots ?? []); }).catch(e => { if (!controller.signal.aborted) {
            setError(e.message || "Unable to check availability.");
            setSlots([]);
        } }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [base, day, showPicker]);
    const stamp = (v: string) => new Intl.DateTimeFormat("en-US", { timeZone: displayZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(v));
    async function mutate(payload: unknown) {
        if (pending.current)
            return;
        pending.current = true;
        setSaving(true);
        setError("");
        try {
            const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), b = await r.json();
            if (!r.ok)
                throw new Error(b.error);
            if (b.token) {
                router.push(`/meet/manage/${b.token}?booked=1`);
                return;
            }
            setSuccess("Saved. Your session details are up to date.");
            setRescheduling(false);
            setCancelConfirm(false);
            router.refresh();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Unable to save. Please try again.");
        }
        finally {
            pending.current = false;
            setSaving(false);
        }
    }
    return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8 sm:py-14"><div className="mx-auto max-w-5xl">
    <a href="https://www.oceanoblue.net" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold tracking-[.14em] text-ocean-900">OCEANO BLUE <span className="font-normal tracking-normal text-slate-500">Media</span></a>
    <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-ink-100 md:grid md:grid-cols-[.82fr_1.18fr]">
      <aside className="bg-ocean-950 p-7 text-white sm:p-10"><div className="mb-8 grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><CalendarDays className="h-6 w-6"/></div><p className="mb-3 text-xs uppercase tracking-[.18em] text-ocean-200">{managed ? "Your session" : "Let’s make something great"}</p><h1 className="font-display text-3xl leading-tight sm:text-4xl">{type.name}</h1>{type.description && <p className="mt-5 text-sm leading-relaxed text-slate-200">{type.description}</p>}<div className="mt-8 space-y-4 text-sm"><p className="flex items-center gap-3"><Clock className="h-4 w-4 shrink-0"/>{type.duration_minutes} minutes</p>{type.location && <p className="flex items-start gap-3 break-words"><MapPin className="mt-0.5 h-4 w-4 shrink-0"/><Location text={type.location}/></p>}</div><p className="mt-10 text-sm leading-relaxed text-slate-300">Questions or special arrangements?<br /><a className="text-white underline underline-offset-4" href="mailto:info@oceanoblue.net">info@oceanoblue.net</a></p></aside>
      <section className="min-w-0 p-6 sm:p-10">
        {readOnly && <p className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Preview only. Open production Ops to book or change a session.</p>}
        {error && <p role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}{success && <p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
        {managed && <div className="mb-7"><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${managed.appointment.status === "cancelled" ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-800"}`}><CheckCircle2 className="h-3.5 w-3.5"/>{managed.appointment.status === "cancelled" ? "Cancelled" : "Confirmed"}</span><h2 className="mt-4 text-xl font-semibold text-ocean-950">{managed.appointment.full_name}</h2><p className="mt-2 text-lg text-ocean-900">{stamp(managed.appointment.starts_at)}</p><p className="mt-1 text-xs text-slate-500">Displayed in {displayZone}</p><div className="mt-5 flex flex-wrap gap-2"><a className="btn-secondary" href={`${base}?calendar=1`}><Download className="h-4 w-4"/>Add to calendar</a>{managed.appointment.status === "confirmed" && <><button className="btn-secondary" disabled={readOnly || !managed.canReschedule || saving} onClick={() => setRescheduling(v => !v)}>Reschedule</button><button className="btn-ghost text-rose-700" disabled={readOnly || saving || !managed.canReschedule} onClick={() => setCancelConfirm(true)}>Cancel session</button></>}</div>{!managed.canReschedule && managed.appointment.status === "confirmed" && <p className="mt-3 text-sm text-slate-600">Contact the office to change this appointment.</p>}{cancelConfirm && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-sm text-rose-900">Cancel this session and release the reserved time?</p><div className="mt-3 flex gap-2"><button className="btn-danger" disabled={saving} onClick={() => void mutate({ action: "cancel", version: managed.appointment.version })}>Yes, cancel session</button><button className="btn-secondary" onClick={() => setCancelConfirm(false)}>Keep session</button></div></div>}</div>}
        {showPicker && <form onSubmit={e => { e.preventDefault(); if (!selected)
            return; if (managed) {
            void mutate({ action: "reschedule", version: managed.appointment.version, starts_at: selected });
            return;
        } const fields = new FormData(e.currentTarget); if(phoneRequired&&!validSessionPhone(String(fields.get("phone")??""))){setError("Enter a phone number we can use for this call.");return;} nonce.current ??= crypto.randomUUID(); void mutate({ id: nonce.current, starts_at: selected, full_name: fields.get("full_name"), email: fields.get("email"), phone: fields.get("phone"), notes: fields.get("notes"), email_consent: fields.get("email_consent") === "on", website: fields.get("website") }); }}>
          <h2 className="text-xl font-semibold text-ocean-950">{managed ? "Choose a new time" : "Choose a time"}</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Date <span className="block text-xs font-normal text-slate-500">Calendar in {type.timezone}</span><input aria-label="Session date" className="input mt-2" type="date" required value={day} min={localSessionDay(new Date(), type.timezone)} onChange={e => setDay(e.target.value)}/></label><label className="text-sm font-medium text-slate-700">Display times in<select className="input mt-2" value={displayZone} onChange={e => setDisplayZone(e.target.value)}>{[...new Set([displayZone, type.timezone, "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "UTC"])].map(z => <option key={z}>{z}</option>)}</select></label></div>
          <div className="mt-5" aria-live="polite">{loading ? <p className="py-5 text-sm text-slate-500">Checking the calendar…</p> : slots.length ? <fieldset><legend className="sr-only">Available session times</legend><div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{slots.map(s => <label key={s} className={`cursor-pointer rounded-xl border p-3 text-center text-sm transition ${selected === s ? "border-ocean-700 bg-ocean-50 font-semibold text-ocean-900" : "border-slate-200 text-slate-700 hover:border-ocean-400 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ocean-500"}`}><input className="sr-only" type="radio" name="slot" value={s} checked={selected === s} onChange={() => setSelected(s)} required/>{stamp(s)}</label>)}</div></fieldset> : !error && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No available times on this date. Try another date or contact our office.</p>}</div>
          {selected && !managed && <fieldset className="mt-7 grid gap-4 border-t border-slate-100 pt-6"><legend className="sr-only">Your details</legend><label className="text-sm font-medium text-slate-700">Full name<input className="input mt-1.5" name="full_name" autoComplete="name" required minLength={2} maxLength={120}/></label><label className="text-sm font-medium text-slate-700">Email<input className="input mt-1.5" name="email" type="email" autoComplete="email" required maxLength={254}/></label><label className="text-sm font-medium text-slate-700">{phoneRequired?"Phone (required for this call)":"Phone"} {!phoneRequired&&<span className="font-normal text-slate-400">optional</span>}<input className="input mt-1.5" name="phone" type="tel" autoComplete="tel" maxLength={50} required={phoneRequired} minLength={phoneRequired?7:undefined}/></label><label className="text-sm font-medium text-slate-700">Anything we should know? <span className="font-normal text-slate-400">optional</span><textarea className="input mt-1.5" name="notes" rows={3} maxLength={2000}/></label><label className="flex items-start gap-3 text-sm text-slate-600"><input className="mt-1 h-4 w-4" type="checkbox" name="email_consent"/>Email me this session’s confirmation, changes and reminders 24 hours and one hour before. This does not subscribe me to marketing.</label><div aria-hidden="true" className="absolute -left-[10000px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div></fieldset>}
          {selected && <button className="btn-primary mt-6 w-full" type="submit" disabled={readOnly || saving || loading}>{saving ? "Saving…" : managed ? "Confirm new time" : "Confirm session"}<ArrowRight className="h-4 w-4"/></button>}
          <p className="mt-5 text-xs leading-relaxed text-slate-500">Your session is reserved after confirmation. Save the private management link to reschedule, cancel or add it to your calendar.</p>
        </form>}
      </section>
    </div><p className="mt-6 text-center text-xs text-slate-500">Oceano Blue Media · Thoughtful experiences, from the first conversation.</p>
  </div></main>;
}
