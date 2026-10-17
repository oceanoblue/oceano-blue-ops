"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Plus, Copy, ExternalLink, RefreshCw, Clock, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { appointmentTimeLabel } from "@/lib/crm/appointment-time";
import { PageHeader } from "@/components/ui/PageHeader";
import { Editor, Label } from "./editors";
import { sessionTypeSchema, type SessionType, type SchedulingData, type Appointment } from "@/lib/crm/scheduling-types";
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function SchedulingWorkspace({ initialData }: {
    initialData: SchedulingData | null;
}) {
    const router = useRouter();
    const [data, setData] = useState(initialData), [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(false), [dispatching, setDispatching] = useState(false), [editor, setEditor] = useState<SessionType | "new" | null>(null), [showPast, setShowPast] = useState(false), [search, setSearch] = useState("");
    const request = useRef<AbortController | null>(null), saving = useRef(false);
    const load = useCallback(async () => { request.current?.abort(); const c = new AbortController(); request.current = c; setLoading(true); try {
        const r = await fetch("/api/crm/scheduling", { cache: "no-store", signal: c.signal }), b = await r.json();
        if (!r.ok)
            throw new Error(b.error);
        if (!c.signal.aborted) {
            setData(b);
            setError("");
        }
    }
    catch (e) {
        if (!c.signal.aborted)
            setError(e instanceof Error ? e.message : "Unable to load scheduling.");
    }
    finally {
        if (!c.signal.aborted)
            setLoading(false);
    } }, []);
    useEffect(() => { if (!initialData)
        void load(); return () => request.current?.abort(); }, [initialData, load]);
    async function save(payload: unknown) { if (saving.current)
        throw new Error("Please wait for the current save."); saving.current = true; try {
        const r = await fetch("/api/crm/scheduling", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), b = await r.json();
        if (!r.ok)
            throw new Error(b.error);
        setEditor(null);
        setNotice("Saved.");
        await load();
    }
    finally {
        saving.current = false;
    } }
    async function dispatch() {
        if (dispatching) return;
        setDispatching(true); setError("");
        try {
            const r = await fetch("/api/crm/scheduling", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dispatch" }) });
            const result = await r.json();
            if (!r.ok) throw new Error(result.error || "Unable to process notifications.");
            await load();
            setNotice(`Processed ${result.processed ?? 0} due calendar updates or notifications. Review delivery status below.`);
        } catch (e) { setError(e instanceof Error ? e.message : "Unable to process notifications."); }
        finally { setDispatching(false); }
    }
    async function manage(a: Appointment) { setError(""); try {
        const r = await fetch(`/api/crm/scheduling/appointments/${a.id}`, { cache: "no-store" }), b = await r.json();
        if (!r.ok)
            throw new Error(b.error);
        if (!/^\/meet\/manage\/[a-f0-9]{64}$/.test(b.path))
            throw new Error("The session link could not be verified.");
        router.push(b.path);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Unable to open session.");
    } }
    async function copy(type: SessionType) { try {
        await navigator.clipboard.writeText(`${window.location.origin}/meet/${type.slug}`);
        setNotice("Scheduling link copied.");
    }
    catch {
        setError("Unable to copy. Open the link and copy its address.");
    } }
    const now = Date.now(), appointments = (data?.appointments ?? []).filter(a => (showPast || Date.parse(a.ends_at) >= now) && `${a.title} ${a.full_name} ${a.email}`.toLowerCase().includes(search.toLowerCase())), upcoming = (data?.appointments ?? []).filter(a => a.status === "confirmed" && Date.parse(a.starts_at) > now), review = (data?.notifications ?? []).filter(n => n.status === "needs_review");
    return <div className="space-y-7"><PageHeader title="Scheduling" eyebrow="Client experience" subtitle="One home for consultations, planning calls and client sessions." icon={CalendarDays}><button className="btn-secondary" onClick={() => void load()} disabled={loading} aria-label="Refresh scheduling"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></button><button className="btn-primary" onClick={() => setEditor("new")} disabled={!data?.production}><Plus className="h-4 w-4"/>New link</button></PageHeader>

    {!data?.production && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Preview is read-only. Booking, link changes and client messages run in production Ops.</p>}{error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">Due calendar updates and notifications run automatically each minute.</p><button className="btn-secondary" disabled={dispatching || !data?.production} onClick={() => void dispatch()}>{dispatching ? "Processing…" : "Process due notifications"}</button></div>
    <div className="grid gap-4 sm:grid-cols-3">{[{ label: "Upcoming sessions", value: upcoming.length, icon: CalendarDays }, { label: "Published links", value: data?.types.filter(t => t.published).length ?? 0, icon: CheckCircle2 }, { label: "Needs attention", value: review.length, icon: AlertCircle }].map(s => <div key={s.label} className="card flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">{s.label}</p><p className="mt-1 font-display text-3xl text-ocean-950">{s.value}</p></div><s.icon className="h-6 w-6 text-ocean-400"/></div>)}</div>
    <div className="grid items-start gap-6 xl:grid-cols-[1.35fr_1fr]"><section className="card overflow-hidden"><div className="border-b border-slate-100 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl text-ocean-950">Your agenda</h2><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)}/>Include recent history</label></div><input className="input mt-4" placeholder="Search clients or sessions" aria-label="Search sessions" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="divide-y divide-slate-100">{appointments.map(a => <article className="p-5" key={a.id}><div className="flex items-start justify-between gap-3"><div><div className="mb-2 flex flex-wrap gap-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.status === "confirmed" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{a.status}</span>{a.source_system && a.source_system !== "ops" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">{a.source_system} · {a.import_state}</span>}</div><h3 className="font-semibold text-ocean-950">{a.title}</h3><p className="mt-1 text-sm text-slate-600">{a.full_name}</p><p className="mt-2 flex flex-wrap items-start gap-x-2 gap-y-1 text-sm text-ocean-800"><Clock className="mt-0.5 h-4 w-4 shrink-0"/>{appointmentTimeLabel(a)}<span className="w-full pl-6 text-xs text-slate-400">{a.timezone}</span></p>{a.location && <p className="mt-2 break-words text-xs text-slate-500">{a.location}</p>}</div><button className="btn-secondary shrink-0" onClick={() => void manage(a)}>Manage</button></div>{a.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{a.notes}</p>}</article>)}{!appointments.length && <div className="p-10 text-center"><CalendarDays className="mx-auto h-9 w-9 text-ocean-300"/><h3 className="mt-3 font-semibold text-ocean-950">Your next conversations belong here</h3><p className="mt-2 text-sm text-slate-500">Publish a scheduling link and share it with a client. Every reservation creates a CRM project and an assigned task.</p></div>}</div>{(data?.appointments.length ?? 0) >= 500 && <p className="border-t p-4 text-xs text-amber-800">Showing the first 500 sessions. Contact the office for a complete export.</p>}</section>
    <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="font-display text-xl text-ocean-950">Reusable links</h2><span className="text-xs text-slate-500">Live calendar verification</span></div>{data?.types.map(t => <article key={t.id} className="card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-ocean-500">{t.published ? "Published" : "Draft"}</p><h3 className="mt-1 font-semibold text-ocean-950">{t.name}</h3><p className="mt-1 text-xs text-slate-500">{t.duration_minutes} min · {data.team.find(m => m.id === t.owner_id)?.full_name ?? "Host"}</p></div><button className="btn-ghost" onClick={() => setEditor(t)} disabled={!data.production}>Edit</button></div><p className="mt-3 text-sm text-slate-600">{t.description}</p><div className="mt-4 flex gap-2"><button className="btn-secondary" disabled={!t.published} onClick={() => void copy(t)}><Copy className="h-3.5 w-3.5"/>Copy link</button>{t.published && <a className="btn-ghost" href={`/meet/${t.slug}`} target="_blank" rel="noopener noreferrer">Open<ExternalLink className="h-3.5 w-3.5"/></a>}</div><p className="mt-3 text-xs text-slate-400">{t.notice_minutes / 60}h notice · {t.buffer_before_minutes??t.buffer_minutes}m before / {t.buffer_after_minutes??t.buffer_minutes}m after · {t.booking_horizon_months?`${t.booking_horizon_months} calendar months`: `${t.horizon_days} days`} ahead</p></article>)}{!data?.types.length && <div className="card p-6"><p className="font-medium text-ocean-950">A link for every client conversation</p><p className="mt-2 text-sm leading-relaxed text-slate-600">Set up a consultation, wedding planning call, portrait session or a full day of filming. Your connected calendar and existing shoots protect every booking.</p><button className="btn-primary mt-5" disabled={!data?.production} onClick={() => setEditor("new")}>Create scheduling link</button></div>}<div className="rounded-xl border border-ocean-100 bg-ocean-50/50 p-4 text-xs leading-relaxed text-ocean-800">Clients can reschedule or cancel through their private link and download a calendar event. Clients who opt in receive email confirmations and reminders 24 hours and one hour before. The office receives its own email alerts. SMS is not enabled. Imported source appointments keep their original management and never send new client messages.</div></section></div>
    {review.length > 0 && <section className="card p-5"><h2 className="font-semibold text-ocean-950">Email and calendar delivery need review</h2><p className="mt-1 text-sm text-slate-500">Check the provider before retrying a message or calendar change.</p><ul className="mt-4 space-y-2">{review.map(n => <li key={n.id} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{n.kind} · {n.last_error || "Acceptance could not be verified."}</li>)}</ul></section>}
    {editor && data && <Editor title={editor === "new" ? "Create scheduling link" : "Edit scheduling link"} close={() => setEditor(null)}><SessionEditor item={editor === "new" ? undefined : editor} team={data.team} save={save}/></Editor>}
  </div>;
}
function SessionEditor({ item, team, save }: {
    item?: SessionType;
    team: SchedulingData["team"];
    save: (payload: unknown) => Promise<void>;
}) {
    const [draft, setDraft] = useState(() => item ?? { id: crypto.randomUUID(), version: 1, name: "", slug: "", description: "",confirmation_instructions:"",owner_id: team[0]?.id ?? "", duration_minutes: 30, timezone: "America/New_York", availability: [1, 2, 3, 4, 5].map(day => ({ day, start: "09:00", end: "17:00" })), notice_minutes: 1440, horizon_days: 90, booking_horizon_months:null,slot_interval_minutes:15,use_session_as_project_date:false,buffer_minutes: 15,buffer_before_minutes:null,buffer_after_minutes:null,location: "", published: false }), [busy, setBusy] = useState(false), [error, setError] = useState("");
    const patch = (v: Partial<SessionType>) => setDraft(d => ({ ...d, ...v }));
    return <form className="space-y-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(""); try {
        const parsed = sessionTypeSchema.safeParse(draft);
        if (!parsed.success)
            throw new Error(parsed.error.issues[0].message);
        await save({ action: "type_save", id: draft.id, version: item?.version ?? null, data: parsed.data });
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Unable to save link.");
    }
    finally {
        setBusy(false);
    } }}>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}<Label name="Session name"><input className="input" value={draft.name} onChange={e => patch({ name: e.target.value })} required maxLength={120} placeholder="Wedding planning call"/></Label><Label name="Link address"><div className="flex items-center gap-1 text-sm text-slate-500"><span>/meet/</span><input className="input" value={draft.slug} onChange={e => patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} required placeholder="wedding-planning"/></div></Label><Label name="Description"><textarea className="input" rows={3} value={draft.description} onChange={e => patch({ description: e.target.value })} maxLength={2000}/></Label><div className="grid gap-4 sm:grid-cols-2"><Label name="Host"><select className="input" required value={draft.owner_id} onChange={e => patch({ owner_id: e.target.value })}>{team.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Label><Label name="Duration, minutes"><input className="input" type="number" min={15} max={720} required value={draft.duration_minutes} onChange={e => patch({ duration_minutes: Number(e.target.value) })}/></Label></div><Label name="Location or meeting link"><input className="input" value={draft.location} onChange={e => patch({ location: e.target.value })} maxLength={500} placeholder="Phone call, studio address or secure meeting URL"/></Label><Label name="Confirmation and preparation instructions"><textarea className="input" rows={5} value={draft.confirmation_instructions} maxLength={8000} onChange={e=>patch({confirmation_instructions:e.target.value})} placeholder="What should clients prepare before this session? This text is saved with each booking and included in confirmation and reminder emails."/></Label><Label name="Availability timezone"><input className="input" value={draft.timezone} onChange={e => patch({ timezone: e.target.value })} required placeholder="America/New_York"/></Label><div className="grid gap-4 sm:grid-cols-2"><Label name="Start times every, minutes"><input className="input" type="number" min={1} max={720} required value={draft.slot_interval_minutes} onChange={e=>patch({slot_interval_minutes:Number(e.target.value)})}/></Label><Label name="Calendar-month booking horizon"><select className="input" value={draft.booking_horizon_months??""} onChange={e=>patch({booking_horizon_months:e.target.value?Number(e.target.value):null})}><option value="">Use days below</option>{Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>{n} calendar {n===1?"month":"months"}</option>)}</select></Label></div><fieldset className="space-y-3"><legend className="mb-3 text-sm font-semibold text-ocean-950">Weekly availability</legend>{draft.availability.map((w, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"><select className="input col-span-3 sm:col-span-1" aria-label={`Availability day ${i + 1}`} value={w.day} onChange={e => patch({ availability: draft.availability.map((a, j) => i === j ? { ...a, day: Number(e.target.value) } : a) })}>{days.map((d, n) => <option key={d} value={n}>{d}</option>)}</select><input className="input min-w-0 px-2" aria-label={`Start time ${i + 1}`} type="time" required value={w.start} onChange={e => patch({ availability: draft.availability.map((a, j) => i === j ? { ...a, start: e.target.value } : a) })}/><input className="input min-w-0 px-2" aria-label={`End time ${i + 1}`} type="time" required value={w.end} onChange={e => patch({ availability: draft.availability.map((a, j) => i === j ? { ...a, end: e.target.value } : a) })}/><button className="btn-ghost px-2" type="button" aria-label={`Remove availability window ${i + 1}`} disabled={draft.availability.length <= 1} onClick={() => patch({ availability: draft.availability.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4"/></button></div>)}<button className="btn-secondary" type="button" disabled={draft.availability.length >= 21} onClick={() => patch({ availability: [...draft.availability, { day: 1, start: "09:00", end: "17:00" }] })}>Add window</button></fieldset><div className="grid gap-3 sm:grid-cols-3"><Label name="Minimum notice, hours"><input className="input" type="number" min={0} max={720} step={.5} required value={draft.notice_minutes / 60} onChange={e => patch({ notice_minutes: Math.round(Number(e.target.value) * 60) })}/></Label><Label name="Before, minutes"><input className="input" type="number" min={0} max={180} required value={draft.buffer_before_minutes??draft.buffer_minutes} onChange={e=>patch({buffer_before_minutes:Number(e.target.value)})}/></Label><Label name="After, minutes"><input className="input" type="number" min={0} max={180} required value={draft.buffer_after_minutes??draft.buffer_minutes} onChange={e=>patch({buffer_after_minutes:Number(e.target.value)})}/></Label><Label name="Book ahead, days"><input className="input" type="number" min={1} max={365} required disabled={draft.booking_horizon_months!==null} value={draft.horizon_days} onChange={e => patch({ horizon_days: Number(e.target.value) })}/></Label></div><label className="flex items-start gap-3 text-sm text-slate-700"><input className="mt-1 h-4 w-4" type="checkbox" checked={draft.use_session_as_project_date} onChange={e=>patch({use_session_as_project_date:e.target.checked})}/><span>Use the session date as the new project’s date. Consultation calls can keep the actual project date separate.</span></label><label className="flex items-start gap-3 rounded-xl bg-ocean-50 p-4 text-sm text-ocean-900"><input type="checkbox" className="mt-1 h-4 w-4" checked={draft.published} onChange={e => patch({ published: e.target.checked })}/><span>Publish link for clients<span className="mt-1 block text-xs text-ocean-700">The host’s Google calendar is verified before publishing and each reservation. A disconnected calendar stops bookings.</span></span></label><button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save scheduling link"}</button>
  </form>;
}
