"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, CalendarDays, Flag, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Editor, Label } from "./editors";
import { factLabel, factText, migrationKinds, migrationStates, type MigrationData, type MigrationFilters, type MigrationObservation } from "@/lib/crm/migration-types";
import { fmtDateTime } from "@/lib/utils/format";
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const localInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const initialFilters: MigrationFilters = { query: "", page: 0, year: null, status: "unresolved", kind: "all" };
const stateStyle: Record<string, string> = { pending: "bg-amber-50 text-amber-900", active: "bg-ocean-50 text-ocean-900", history: "bg-slate-100 text-slate-600", resolved: "bg-emerald-50 text-emerald-800" };
export function MigrationWorkspace({ initialData }: { initialData: MigrationData | null }) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState(initialFilters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<MigrationObservation | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const first = useRef(true);
  const saving = useRef(false);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    try {
      const p = new URLSearchParams({ q: filters.query, page: String(filters.page), status: filters.status, kind: filters.kind });
      if (filters.year) p.set("year", String(filters.year));
      const r = await fetch(`/api/crm/migration?${p}`, { cache: "no-store", signal: request.signal });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (!request.signal.aborted) { setData(body); setError(""); }
    } catch (e) {
      if (!request.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load migration review.");
    } finally { if (!request.signal.aborted) setBusy(false); }
  }, [filters]);
  useEffect(() => {
    if (first.current) { first.current = false; if (initialData) return; }
    const timer = setTimeout(() => void load(), 250);
    return () => { clearTimeout(timer); controller.current?.abort(); };
  }, [load, initialData]);
  async function review(body: Record<string, unknown>) {
    if (saving.current) throw new Error("A review is already saving.");
    saving.current = true;
    try {
      const r = await fetch("/api/crm/migration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setSelected(null);
      setNotice("Review saved with its reason and history. Source evidence is preserved.");
      await load();
    } finally { saving.current = false; }
  }
  const patch = (change: Partial<MigrationFilters>) => setFilters(old => ({ ...old, ...change, page: change.page ?? 0 }));
  const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];
  return <div className="space-y-6">
    <PageHeader eyebrow="Migration review" title="Keep every commitment in view" subtitle="Review source projects, payment evidence, and scheduled sessions before leaving HoneyBook." icon={ClipboardCheck}>
      <button className="btn-secondary" disabled={busy} onClick={() => void load()} aria-label="Refresh migration review"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /><span className="hidden sm:inline">Refresh</span></button>
    </PageHeader>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {data && <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
      { label: "Awaiting review", value: data.counts.pending, help: "Source observations to check" },
      { label: "Active follow-through", value: data.counts.active, help: "Office confirmed next steps" },
      { label: "Urgent unresolved", value: data.counts.urgent, help: `${data.counts.overdue} past follow-up · ${data.counts.unassigned} unassigned` },
      { label: "Source records", value: data.counts.total, help: `${data.counts.history} historical · ${data.counts.resolved} resolved` },
    ].map(card => <div className="card p-4 sm:p-5" key={card.label}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p><p className="mt-2 text-3xl tabular-nums text-ink-950">{card.value}</p><p className="mt-2 text-xs leading-relaxed text-slate-500">{card.help}</p></div>)}</div>}
    <p className="rounded-xl border border-ocean-100 bg-ocean-50/50 p-4 text-sm leading-relaxed text-ocean-900">These are dated observations from the source account. A project date does not confirm an appointment time. Resolving a review does not reconcile a balance, cancel a source booking, change a project, or send a client message.</p>
    {data && !data.production && <p className="text-sm text-slate-500">This preview is read-only. Save reviews in production Ops.</p>}
    <section className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 lg:flex-row">
        <input aria-label="Search migration evidence" className="input flex-1" placeholder="Search client, project, or source reference…" value={filters.query} maxLength={120} onChange={e => patch({ query: e.target.value })} />
        <select aria-label="Source project or appointment year" className="input lg:w-auto" value={filters.year ?? ""} onChange={e => patch({ year: e.target.value ? Number(e.target.value) : null })}><option value="">All dated and undated records</option>{years.map(year => <option key={year} value={year}>{year}</option>)}</select>
        <select aria-label="Migration review status" className="input lg:w-auto" value={filters.status} onChange={e => patch({ status: e.target.value as MigrationFilters["status"] })}><option value="unresolved">Unresolved reviews</option><option value="all">Every review status</option>{migrationStates.map(state => <option key={state} value={state}>{factLabel(state)}</option>)}</select>
        <select aria-label="Source record type" className="input lg:w-auto" value={filters.kind} onChange={e => patch({ kind: e.target.value as MigrationFilters["kind"] })}><option value="all">All source types</option>{migrationKinds.map(kind => <option key={kind} value={kind}>{factLabel(kind)}</option>)}</select>
      </div>
      {!data ? <p className="p-8 text-center text-slate-500">{busy ? "Loading migration review…" : "Migration review is unavailable."}</p> : <>
        <p className="text-xs text-slate-500" aria-live="polite">{data.total} matching source observations · {data.counts.total} records across all filters</p>
        {!data.observations.length ? <div className="card p-10 text-center"><ClipboardCheck className="mx-auto h-8 w-8 text-ocean-500" /><h2 className="mt-4 text-xl text-ink-950">{data.counts.total ? "No reviews match these filters" : "Source review is ready"}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">{data.counts.total ? "Search all review statuses or include undated records to check the rest of the evidence." : "Verified source observations will appear here with their dates, uncertainties, and office next steps."}</p></div> : data.observations.map(item => <article className="card p-5 sm:p-6" key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2.5 py-1 font-medium ${stateStyle[item.review_state]}`}>{factLabel(item.review_state)}</span><span className="text-slate-500">{factLabel(item.source_kind)} · {item.source_system}</span>{item.priority === "urgent" && <span className="inline-flex items-center gap-1 font-medium text-rose-700"><Flag className="h-3.5 w-3.5" />Urgent</span>}</div><h2 className="mt-3 break-words text-xl text-ink-950">{item.title}</h2><p className="mt-1 text-xs text-slate-500">Observed {fmtDateTime(item.observed_at)} · Reference {item.source_id}</p></div><button className="btn-secondary" disabled={!data.production} onClick={() => setSelected(item)}>Review & assign<ArrowRight className="h-4 w-4" /></button></div>
          {(item.project_date || item.starts_at) && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">{item.project_date && <p className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-ocean-600" />Source project date: {dateLabel(item.project_date)}</p>}{item.starts_at && <p>Source session: {fmtDateTime(item.starts_at)}{item.ends_at ? ` – ${fmtDateTime(item.ends_at)}` : " · end time not recorded"}</p>}</div>}
          {!!item.flags.length && <div className="mt-4 flex flex-wrap gap-2">{item.flags.map((flag, n) => <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900" key={`${flag}-${n}`}>{factLabel(flag)}</span>)}</div>}
          <div className="mt-5 grid gap-4 rounded-xl bg-ink-50/70 p-4 sm:grid-cols-3"><div className="sm:col-span-2"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next office action</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-900">{item.next_action || "Review the source evidence and set the next action."}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Owner & follow-up</p><p className="mt-2 text-sm text-ink-900">{data.owners.find(owner => owner.id === item.owner_id)?.full_name ?? (item.owner_id ? "Previous office owner" : "Unassigned")}</p><p className="mt-1 text-xs text-slate-500">{item.follow_up_at ? fmtDateTime(item.follow_up_at) : "No follow-up date set"}</p></div></div>
          <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium text-ocean-700">Source evidence & review history</summary><dl className="mt-4 grid gap-4 sm:grid-cols-2">{Object.entries(item.facts).map(([key, value]) => <div key={key}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{factLabel(key)}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{factText(value)}</dd></div>)}</dl>{!!item.reviews.length && <div className="mt-5 border-t border-ink-100 pt-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Latest {item.reviews.length} reviews</p>{item.reviews.map(review => <p className="mt-3 text-sm leading-relaxed text-slate-600" key={review.id}><span className="font-medium text-ink-900">{review.actor_name ?? "Office"} · {factLabel(review.review_state)}</span><span className="mt-1 block">{review.reason}</span><span className="mt-1 block text-xs text-slate-500">{fmtDateTime(review.created_at)}</span></p>)}</div>}</details>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ocean-700 hover:underline">Open source<ExternalLink className="h-3.5 w-3.5" /></a>}{item.linked_ops_project && <Link href="/dashboard/crm" className="text-ocean-700 hover:underline">Linked to an Ops project</Link>}</div>
        </article>)}
        <div className="flex items-center justify-between border-t border-ink-100 pt-4"><button className="btn-secondary" disabled={busy || filters.page === 0} onClick={() => patch({ page: filters.page - 1 })}><ChevronLeft className="h-4 w-4" />Previous</button><p className="text-xs text-slate-500">Page {data.page + 1} of {Math.max(1, Math.ceil(data.total / data.page_size))}</p><button className="btn-secondary" disabled={busy || (filters.page + 1) * data.page_size >= data.total} onClick={() => patch({ page: filters.page + 1 })}>Next<ChevronRight className="h-4 w-4" /></button></div>
      </>}
    </section>
    {selected && data && <Editor title="Review source observation" close={() => setSelected(null)}><ReviewEditor item={selected} owners={data.owners} save={review} /></Editor>}
  </div>;
}
function ReviewEditor({ item, owners, save }: { item: MigrationObservation; owners: MigrationData["owners"]; save: (body: Record<string, unknown>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState(item.linked_ops_project ?? "");
  const [projects, setProjects] = useState<{ project_id: string; title: string }[]>([]);
  useEffect(() => {
    const request = new AbortController();
    const timer = setTimeout(() => {
      const p = new URLSearchParams({ projects_only: "1", q: query });
      void fetch(`/api/crm/migration?${p}`, { cache: "no-store", signal: request.signal }).then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        if (!request.signal.aborted) setProjects(body.projects);
      }).catch(e => { if (!request.signal.aborted) setError(e.message); });
    }, 250);
    return () => { clearTimeout(timer); request.abort(); };
  }, [query]);
  return <form className="space-y-5" onSubmit={e => {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true); setError("");
    void save({ action: "review", id: item.id, version: item.version, data: { review_state: f.get("review_state"), priority: f.get("priority"), next_action: f.get("next_action"), owner_id: f.get("owner_id") || null, follow_up_at: f.get("follow_up_at") ? new Date(String(f.get("follow_up_at"))).toISOString() : null, linked_ops_project: project || null, reason: f.get("reason") } }).catch(e => setError(e instanceof Error ? e.message : "Unable to save review.")).finally(() => setBusy(false));
  }}>
    <p className="text-sm leading-relaxed text-slate-600">{item.title}. Source facts remain fixed. Record what the office checked and who will handle the next action.</p>
    <div className="grid gap-4 sm:grid-cols-2"><Label name="Review status"><select className="input" name="review_state" defaultValue={item.review_state}>{migrationStates.map(state => <option key={state} value={state}>{factLabel(state)}</option>)}</select></Label><Label name="Priority"><select className="input" name="priority" defaultValue={item.priority}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></Label></div>
    <p className="text-xs leading-relaxed text-slate-500">Active means the office identified work to follow through on. History marks an old record. Resolved means this review is handled; it is separate from payment reconciliation or project completion.</p>
    <Label name="Next office action"><textarea className="input" name="next_action" rows={3} maxLength={4000} defaultValue={item.next_action} /></Label>
    <div className="grid gap-4 sm:grid-cols-2"><Label name="Office owner"><select className="input" name="owner_id" defaultValue={item.owner_id ?? ""}><option value="">Unassigned</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.full_name}</option>)}</select></Label><Label name="Follow-up (your local time)"><input className="input" name="follow_up_at" type="datetime-local" defaultValue={localInput(item.follow_up_at)} /></Label></div>
    <Label name="Find an Ops project to link (optional)"><input className="input" maxLength={120} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search project name…" /></Label>
    <Label name="Linked Ops project"><select className="input" value={project} onChange={e => setProject(e.target.value)}><option value="">No linked project</option>{project && !projects.some(p => p.project_id === project) && <option value={project}>Current linked Ops project</option>}{projects.map(p => <option key={p.project_id} value={p.project_id}>{p.title}</option>)}</select></Label>
    <Label name="What did you verify or change?"><textarea className="input" name="reason" required minLength={1} maxLength={2000} rows={3} placeholder="Record the source checked and the reason for this decision." /></Label>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    <button className="btn-primary" disabled={busy}>{busy ? "Saving review…" : "Save review & next action"}</button>
  </form>;
}
