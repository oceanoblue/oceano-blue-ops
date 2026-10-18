"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Mail,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Editor, Label } from "./editors";
import type {
  InquiryData,
  InquiryDraft,
  InquiryFilters,
  InquiryItem,
} from "@/lib/crm/inquiry-types";
import { fmtDate, fmtDateTime } from "@/lib/utils/format";

const initialFilters: InquiryFilters = { query: "", status: "unanswered", page: 0 };
const filterLabels: Record<InquiryFilters["status"], string> = {
  due: "Due for a reply",
  unanswered: "Unanswered",
  snoozed: "Snoozed",
  answered: "Answered",
  dismissed: "Dismissed",
  closed: "Closed projects",
  all: "All inquiries",
};
type ActionResult = { id?: string; version?: number; job_id?: string; draft?: InquiryDraft };
type Save = (body: Record<string, unknown>) => Promise<ActionResult>;
const queuedStatuses = new Set(["pending", "queued", "leased", "processing", "sending", "needs_approval"]);

function replyQueued(item: InquiryItem) {
  return !!item.reply_status && queuedStatuses.has(item.reply_status);
}

function answerText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(answerText).join(" · ") || "Not provided";
  return JSON.stringify(value, null, 2);
}

function statusLabel(item: InquiryItem) {
  if (item.closed) return "Project closed";
  if (item.state === "answered") return "Answered";
  if (item.state === "dismissed") return "Dismissed";
  if (item.reply_status === "needs_review") return "Delivery needs review";
  if (replyQueued(item)) return "Reply queued";
  if (item.state === "snoozed" && item.snoozed_until && Date.parse(item.snoozed_until) > Date.now()) return "Snoozed";
  return Date.parse(item.due_at) <= Date.now() ? "Reply needed" : "Awaiting reply";
}

function statusStyle(item: InquiryItem) {
  const label = statusLabel(item);
  if (label === "Answered") return "bg-emerald-50 text-emerald-800 ring-emerald-100";
  if (label === "Reply needed") return "bg-amber-50 text-amber-900 ring-amber-100";
  if (label === "Delivery needs review") return "bg-rose-50 text-rose-800 ring-rose-100";
  if (label === "Snoozed" || label === "Reply queued") return "bg-ocean-50 text-ocean-800 ring-ocean-100";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function InquiryInbox({ initialData }: { initialData: InquiryData | null }) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<InquiryItem | null>(null);
  const [tracking, setTracking] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const first = useRef(true);
  const saving = useRef(false);

  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: filters.query, status: filters.status, page: String(filters.page) });
      const response = await fetch(`/api/crm/inquiries?${params}`, { cache: "no-store", signal: request.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load inquiries.");
      if (!request.signal.aborted) {
        setData(body);
        setError("");
      }
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load inquiries.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (initialData) return;
    }
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [initialData, load]);
  useEffect(() => () => controller.current?.abort(), []);

  const save: Save = async (body) => {
    if (saving.current) throw new Error("A request is already in progress.");
    saving.current = true;
    try {
      const response = await fetch("/api/crm/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The inquiry could not be updated. Please retry.");
      if (body.action !== "draft") {
        setSelected(null);
        setTracking(false);
        setNotice(body.action === "send_reply"
          ? "Reply queued. Check Outbox for its status. The inquiry is marked answered when the email provider accepts it."
          : body.action === "snooze" ? "Follow-up snoozed until the time you chose."
          : body.action === "answered" ? "Response recorded. Unanswered reminders have stopped for this inquiry."
          : body.action === "reopen" ? "Inquiry reopened for office follow-up."
          : body.action === "enroll_project" ? "Inquiry added to the office reply queue. No acknowledgement or client email was sent."
          : "Inquiry dismissed with your note.");
        await load();
      }
      return result;
    } finally {
      saving.current = false;
    }
  };

  const patch = (change: Partial<InquiryFilters>) => setFilters(old => ({ ...old, ...change, page: change.page ?? 0 }));
  const cards = [
    { key: "due", label: "Reply needed", help: "Past the reply deadline", icon: BellRing },
    { key: "unanswered", label: "Unanswered", help: "Including upcoming follow-ups", icon: Inbox },
    { key: "snoozed", label: "Snoozed", help: "Waiting until your chosen time", icon: Clock3 },
    { key: "answered", label: "Answered", help: "A personal response is recorded", icon: CheckCircle2 },
  ] as const;

  return <div className="space-y-6">
    <PageHeader eyebrow="Inquiry inbox" title="Every inquiry deserves a reply" subtitle="See who is waiting, prepare a thoughtful response, and keep follow-ups moving." icon={Inbox}>
      <button className="btn-secondary" disabled={loading} onClick={() => void load()} aria-label="Refresh inquiry inbox"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /><span>Refresh</span></button>
      <Link className="btn-secondary" href="/dashboard/crm/acquisition">Templates & outbox<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      <button className="btn-primary" disabled={!data?.production} onClick={() => setTracking(true)}><Plus className="h-4 w-4" aria-hidden="true" />Track existing project</button>
    </PageHeader>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-800">{notice}</p>}

    {data && <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map(({ key, label, help, icon: Icon }) => <button key={key} aria-pressed={filters.status === key} onClick={() => patch({ status: key })} className={`card min-w-0 p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-500 sm:p-5 ${filters.status === key ? "ring-2 ring-ocean-500" : "hover:border-ocean-300"}`}>
        <div className="flex items-start justify-between gap-2"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><Icon className={`h-4 w-4 shrink-0 ${key === "due" && data.counts.due ? "text-amber-600" : "text-ocean-600"}`} aria-hidden="true" /></div>
        <p className="mt-3 text-3xl tabular-nums text-ink-950">{data.counts[key]}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{help}</p>
      </button>)}
    </div>}

    <div className="rounded-xl border border-ocean-100 bg-ocean-50/50 p-4 sm:px-5">
      <p className="text-sm leading-relaxed text-ocean-950">An automatic acknowledgement keeps a client informed. A personal reply is what clears an inquiry from this queue.</p>
      <p className="mt-2 text-xs leading-relaxed text-ocean-800">Replies sent by phone, in HoneyBook, or in another inbox need to be recorded here to keep reminders accurate.</p>
      {data && <p className="mt-2 text-xs leading-relaxed text-ocean-800">{data.email.officeNotificationsEnabled
        ? `Office reminders are enabled${data.email.officeRecipient ? ` for ${data.email.officeRecipient}` : ""}: after 24 hours, then once more 48 hours after the first alert if a reply is still needed.`
        : "Office reminder email delivery needs configuration. Inquiries and due follow-ups remain visible here."}</p>}
    </div>
    {data && (data.notifications.needs_review > 0 || data.notifications.blocked > 0) && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900"><p className="font-medium">Office reminder delivery needs attention</p><p className="mt-1">{data.notifications.needs_review} with an uncertain delivery outcome · {data.notifications.blocked} blocked. Keep using the reply queue below while the office checks reminder delivery.</p></div>}
    {data && !data.production && <p className="text-sm text-slate-500">This preview is read-only. Prepare and send replies or update follow-ups in production Ops.</p>}

    <section aria-label="Inquiries" aria-busy={loading} className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input aria-label="Search inquiries" className="input pl-10" placeholder="Search client, project, or inquiry…" value={filters.query} maxLength={120} onChange={event => patch({ query: event.target.value })} /></div>
        <select aria-label="Inquiry response status" className="input sm:w-56" value={filters.status} onChange={event => patch({ status: event.target.value as InquiryFilters["status"] })}>{Object.entries(filterLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </div>

      {!data ? <div className="card p-10 text-center"><Inbox className="mx-auto h-8 w-8 text-ocean-500" aria-hidden="true" /><p className="mt-3 text-sm text-slate-500">{loading ? "Loading inquiry inbox…" : "Your inquiry inbox is unavailable. Please retry."}</p></div> : <>
        <p aria-live="polite" className="text-xs text-slate-500">{loading ? "Updating inquiries…" : `${data.total} matching ${data.total === 1 ? "inquiry" : "inquiries"} · ${data.counts.total} tracked in total`}</p>
        {data.inquiries.length ? <div className="space-y-3">{data.inquiries.map(item => <article key={item.id} className="card overflow-hidden">
          <div className={`p-5 sm:p-6 ${statusLabel(item) === "Reply needed" ? "border-l-4 border-amber-400" : "border-l-4 border-transparent"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusStyle(item)}`}>{statusLabel(item)}</span><span className="text-xs text-slate-500">{item.source}</span></div><h2 className="mt-3 break-words text-xl text-ink-950">{item.client_name}</h2><p className="mt-1 break-words text-sm text-slate-600">{item.title}</p></div>
              <button className="btn-primary self-start" onClick={() => setSelected(item)}>{item.state === "answered" || item.state === "dismissed" || item.closed ? "View inquiry" : "Review & reply"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <p className="mt-4 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">{item.message || "No message was recorded with this inquiry."}</p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink-100 pt-4 text-xs text-slate-500"><span>Received {fmtDateTime(item.received_at)}</span><span>Owner: {item.owner_name || "Unassigned"}</span>{item.state === "answered" && item.answered_at ? <span>Answered {fmtDateTime(item.answered_at)}</span> : item.state === "snoozed" && item.snoozed_until ? <span>Follow-up {fmtDateTime(item.snoozed_until)}</span> : !item.closed && item.state !== "dismissed" ? <span>Reply due {fmtDateTime(item.due_at)}</span> : null}</div>
          </div>
        </article>)}</div> : <div className="card p-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-ocean-500" aria-hidden="true" /><h2 className="mt-4 text-xl text-ink-950">{filters.query ? "No inquiries match your search" : filters.status === "due" ? "No replies are overdue" : filters.status === "unanswered" ? "No unanswered inquiries" : "No inquiries in this view"}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">{data.counts.total ? "Choose another response status or clear your search to see the rest of your inquiries." : "New website inquiries appear here with their message, reply deadline, and office reminders."}</p>{(filters.query || filters.status !== "all") && data.counts.total > 0 && <button className="btn-secondary mt-5" onClick={() => patch({ query: "", status: "all" })}>View all inquiries</button>}</div>}
        <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-4"><button className="btn-secondary" disabled={loading || filters.page === 0} onClick={() => patch({ page: filters.page - 1 })}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</button><p className="text-xs text-slate-500">Page {data.page + 1} of {Math.max(1, Math.ceil(data.total / data.page_size))}</p><button className="btn-secondary" disabled={loading || (filters.page + 1) * data.page_size >= data.total} onClick={() => patch({ page: filters.page + 1 })}>Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button></div>
      </>}
    </section>

    {selected && data && <Editor title={selected.client_name} close={() => setSelected(null)}><InquiryDetail key={selected.id} item={selected} data={data} save={save} /></Editor>}
    {tracking && data?.production && <Editor title="Track an existing inquiry" close={() => setTracking(false)}><TrackInquiryEditor save={save} /></Editor>}
  </div>;
}

function InquiryDetail({ item, data, save }: { item: InquiryItem; data: InquiryData; save: Save }) {
  const [tab, setTab] = useState<"reply" | "follow-up" | "history">(item.state === "answered" || item.state === "dismissed" || item.closed ? "history" : "reply");
  return <div className="space-y-6">
    <div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusStyle(item)}`}>{statusLabel(item)}</span><span className="text-xs text-slate-500">{item.source}</span></div><p className="mt-3 break-words text-sm text-slate-600">{item.title}</p><p className="mt-2 inline-flex max-w-full items-start gap-2 break-all text-sm text-ink-900"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-ocean-600" aria-hidden="true" />{item.client_email}</p></div>
    <dl className="grid grid-cols-2 gap-4 rounded-xl bg-ink-50/70 p-4 text-sm"><div><dt className="text-xs text-slate-500">Received</dt><dd className="mt-1 text-ink-900">{fmtDateTime(item.received_at)}</dd></div><div><dt className="text-xs text-slate-500">Office owner</dt><dd className="mt-1 text-ink-900">{item.owner_name || "Unassigned"}</dd></div><div><dt className="text-xs text-slate-500">Requested project date</dt><dd className="mt-1 text-ink-900">{item.project_date ? fmtDate(item.project_date) : "Not provided"}</dd></div><div><dt className="text-xs text-slate-500">Project type</dt><dd className="mt-1 break-words text-ink-900">{item.project_type || "Not provided"}</dd></div></dl>
    <section><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Original inquiry</h3><div className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-ink-200 bg-white p-4 text-sm leading-relaxed text-ink-800">{item.message || "No inquiry message was recorded."}</div></section>
    {item.answers.length > 0 && <section><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Original form answers</h3><dl className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-200 px-4">{item.answers.map(answer => <div className="py-3" key={answer.key}><dt className="text-xs font-medium text-slate-500">{answer.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-900">{answerText(answer.value)}</dd></div>)}</dl></section>}
    <nav aria-label="Inquiry actions" className="flex gap-1 overflow-x-auto rounded-xl bg-ink-100/60 p-1.5">{[{ key: "reply", label: "Reply" }, { key: "follow-up", label: "Follow-up" }, { key: "history", label: "History" }].map(section => <button key={section.key} aria-pressed={tab === section.key} className={`min-h-11 flex-1 shrink-0 rounded-lg px-3 text-sm font-medium ${tab === section.key ? "bg-white text-ink-950 shadow-soft" : "text-slate-600 hover:bg-white/70"}`} onClick={() => setTab(section.key as typeof tab)}>{section.label}</button>)}</nav>
    {tab === "reply" && <ReplyEditor item={item} data={data} save={save} />}
    {tab === "follow-up" && <FollowUpEditor item={item} production={data.production} save={save} />}
    {tab === "history" && <section className="space-y-4"><h3 className="text-sm font-semibold text-ink-950">Response & follow-up history</h3>{item.response_note && <p className="rounded-xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900">{item.response_note}{item.response_channel && <span className="mt-2 block text-xs">Recorded channel: {item.response_channel}</span>}</p>}{item.reply_status && <p className="text-sm text-slate-600">Latest reply email: <span className="font-medium text-ink-900">{item.reply_status.replaceAll("_", " ")}</span>. <Link className="text-ocean-700 underline" href="/dashboard/crm/acquisition">Review Outbox</Link></p>}{item.history.length ? <ol className="space-y-4 border-l border-ink-200 pl-4">{item.history.map((entry, index) => <li key={`${entry.created_at}-${index}`}><p className="text-sm font-medium capitalize text-ink-900">{entry.action.replaceAll("_", " ")} · {entry.actor_name || "Office"}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">{entry.note}</p><p className="mt-1 text-xs text-slate-500">{fmtDateTime(entry.created_at)}</p></li>)}</ol> : <p className="text-sm leading-relaxed text-slate-500">No office response or follow-up changes have been recorded yet.</p>}</section>}
  </div>;
}

function ReplyEditor({ item, data, save }: { item: InquiryItem; data: InquiryData; save: Save }) {
  const [draft, setDraft] = useState<InquiryDraft | null>(null);
  const [subject, setSubject] = useState(`Re: ${item.title}`.slice(0, 200));
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const pending = useRef(false);
  const alreadyQueued = replyQueued(item);
  const reviewNeeded = item.reply_status === "needs_review";
  const unavailable = !data.production || item.closed || item.state === "dismissed" || item.state === "answered" || alreadyQueued || reviewNeeded;

  async function prepare() {
    if (pending.current) return;
    pending.current = true;
    setBusy("draft");
    setError("");
    try {
      const result = await save({ action: "draft", id: item.id });
      if (!result.draft) throw new Error("The reply draft was unavailable. Please retry.");
      setDraft(result.draft);
      setSubject(result.draft.subject);
      setBody(result.draft.body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare a reply draft.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  return <form className="space-y-5" onSubmit={async event => {
    event.preventDefault();
    if (pending.current || unavailable || !data.email.configured) return;
    pending.current = true;
    setBusy("send");
    setError("");
    try {
      await save({ action: "send_reply", id: item.id, version: draft?.inquiry_version ?? item.version, data: { request_id: requestId, subject, body } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to queue the reply. Retry with this same draft.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }}>
    {unavailable ? <div className="rounded-xl bg-ink-50 p-4 text-sm leading-relaxed text-slate-600"><p>{reviewNeeded ? "The last reply has an uncertain delivery outcome. Review it in Outbox before composing another response." : alreadyQueued ? "A reply is already queued. Check Outbox before starting another response." : !data.production ? "Open production Ops to prepare or send a reply." : item.closed ? "This project is closed. Update the project before sending a new inquiry response." : "This inquiry has been handled. Reopen it under Follow-up if another personal reply is needed."}</p>{(alreadyQueued || reviewNeeded) && <Link className="mt-3 inline-block font-medium text-ocean-700 underline" href="/dashboard/crm/acquisition">Open Outbox</Link>}</div> : <>
      <div className="rounded-xl border border-ocean-100 bg-ocean-50/50 p-4"><div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold text-ocean-950">Start with a personal draft</h3><p className="mt-1 text-xs leading-relaxed text-ocean-800">Use the inquiry to prepare an editable response.</p></div><button type="button" className="btn-secondary shrink-0" disabled={!!busy} onClick={() => void prepare()}><Sparkles className="h-4 w-4 text-ocean-600" aria-hidden="true" />{busy === "draft" ? "Preparing…" : draft || body ? "Replace with new draft" : "Prepare draft"}</button></div></div>
      {draft && <div role="status" className="space-y-2 text-xs leading-relaxed text-slate-600"><p className="font-medium text-ocean-800">{draft.source === "ai" ? "AI-assisted draft · review before sending" : "Personalized starter · review before sending"}</p>{draft.cautions.length > 0 && <ul className="list-disc space-y-1 pl-4">{draft.cautions.map((caution, index) => <li key={index}>{caution}</li>)}</ul>}</div>}
      <p className="text-xs leading-relaxed text-slate-500">Confirm availability, scope, and pricing before making a commitment in your reply.</p>
      <Label name="To"><input className="input" value={item.client_email} readOnly aria-readonly="true" /></Label>
      <Label name="Subject"><input className="input" required maxLength={200} value={subject} onChange={event => setSubject(event.target.value)} disabled={!!busy} /></Label>
      <Label name="Your reply"><textarea className="input min-h-72 leading-relaxed" rows={12} required maxLength={10000} value={body} placeholder="Write your reply, or prepare a draft above…" onChange={event => setBody(event.target.value)} disabled={!!busy} /></Label>
      {!data.email.configured && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Email delivery needs configuration before this reply can be queued.</p>}
      <div className="space-y-3 border-t border-ink-100 pt-4"><button className="btn-primary w-full sm:w-auto" disabled={!!busy || !data.email.configured || !subject.trim() || !body.trim()}><Send className="h-4 w-4" aria-hidden="true" />{busy === "send" ? "Queuing reply…" : "Queue this email"}</button><p className="text-xs leading-relaxed text-slate-500">This action queues the email to {item.client_email}. Review its status in Outbox. Preparing a draft sends nothing.</p></div>
    </>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm leading-relaxed text-rose-800">{error}</p>}
  </form>;
}

function FollowUpEditor({ item, production, save }: { item: InquiryItem; production: boolean; save: Save }) {
  const [action, setAction] = useState<"answered" | "snooze" | "dismiss" | "reopen">(item.state === "answered" || item.state === "dismissed" ? "reopen" : "answered");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const handled = item.state === "answered" || item.state === "dismissed";
  return <form className="space-y-5" onSubmit={async event => {
    event.preventDefault();
    if (pending.current || !production || item.closed) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const note = String(form.get("note") || "");
      let changes: Record<string, unknown> = { note };
      if (action === "answered") changes = { note, channel: form.get("channel") };
      if (action === "snooze") {
        const until = new Date(String(form.get("until")));
        if (!Number.isFinite(until.getTime()) || until.getTime() <= Date.now()) throw new Error("Choose a future follow-up time.");
        changes = { note, until: until.toISOString() };
      }
      await save({ action, id: item.id, version: item.version, data: changes });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the inquiry.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }}>
    <p className="text-sm leading-relaxed text-slate-600">Record a response sent elsewhere, set a better time to follow up, or close an inquiry with a reason. These actions send no client email.</p>
    <Label name="Office action"><select className="input" value={action} onChange={event => setAction(event.target.value as typeof action)} disabled={busy || !production || item.closed}>{handled ? <option value="reopen">Reopen for a reply</option> : <><option value="answered">We replied outside Ops</option><option value="snooze">Snooze office follow-up</option><option value="dismiss">Dismiss inquiry</option></>}</select></Label>
    {action === "answered" && <Label name="How did you reply?"><select className="input" name="channel" defaultValue="email" disabled={busy}><option value="email">Email</option><option value="phone">Phone</option><option value="meeting">Meeting</option><option value="other">Other</option></select></Label>}
    {action === "snooze" && <Label name="Follow up at (your local time)"><input className="input" type="datetime-local" name="until" required disabled={busy} /></Label>}
    <Label name={action === "answered" ? "What did you send or discuss?" : action === "dismiss" ? "Why is no reply needed?" : "Follow-up note"}><textarea className="input" name="note" required minLength={1} maxLength={2000} rows={3} disabled={busy || !production || item.closed} placeholder={action === "answered" ? "For example: Replied in HoneyBook and requested the event timeline." : "Record the reason and the next step for the office."} /></Label>
    {item.closed && <p className="text-sm text-slate-500">This project is closed. Update the project before changing inquiry follow-ups.</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    <button className="btn-primary" disabled={busy || !production || item.closed}>{action === "snooze" ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : action === "answered" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <CalendarDays className="h-4 w-4" aria-hidden="true" />}{busy ? "Saving…" : action === "answered" ? "Record response" : action === "snooze" ? "Snooze follow-up" : action === "dismiss" ? "Dismiss with note" : "Reopen inquiry"}</button>
  </form>;
}

function TrackInquiryEditor({ save }: { save: Save }) {
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<{ project_id: string; title: string; client_name: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [receivedAt] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  useEffect(() => {
    const request = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({ projects_only: "1", q: query });
      void fetch(`/api/crm/inquiries?${params}`, { cache: "no-store", signal: request.signal }).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to find projects.");
        if (!request.signal.aborted) {
          setProjects(result.projects);
          setError("");
        }
      }).catch(cause => {
        if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to find projects.");
      }).finally(() => {
        if (!request.signal.aborted) setSearching(false);
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [query]);

  return <form className="space-y-5" onSubmit={async event => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const received = new Date(String(form.get("received_at")));
      if (!Number.isFinite(received.getTime()) || received.getTime() > Date.now()) throw new Error("Enter when the inquiry was received, up to the current time.");
      await save({ action: "enroll_project", id: selected, data: { message: form.get("message"), source: form.get("source"), received_at: received.toISOString(), note: form.get("note") } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to track this inquiry.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }}>
    <p className="text-sm leading-relaxed text-slate-600">Add an inquiry received in HoneyBook, email, or another channel to an existing active Ops project. This creates office follow-up tracking and reminders.</p>
    <Label name="Find the client’s Ops project"><input className="input" value={query} onChange={event => { setQuery(event.target.value); setSelected(""); }} maxLength={120} placeholder="Search project name…" disabled={busy} /></Label>
    <Label name="Project"><select className="input" value={selected} onChange={event => setSelected(event.target.value)} required disabled={busy || searching}><option value="">{searching ? "Finding projects…" : "Choose an active project"}</option>{projects.map(project => <option key={project.project_id} value={project.project_id}>{project.title}{project.client_name ? ` · ${project.client_name}` : ""}</option>)}</select></Label>
    {!searching && !projects.length && <p className="text-xs leading-relaxed text-slate-500">No active projects match. Create or reopen the project in <Link className="text-ocean-700 underline" href="/dashboard/crm">Relationships</Link> before tracking its inquiry.</p>}
    <div className="grid gap-4 sm:grid-cols-2"><Label name="Inquiry source"><input className="input" name="source" required maxLength={200} defaultValue="HoneyBook" disabled={busy} /></Label><Label name="Received at (your local time)"><input className="input" name="received_at" type="datetime-local" required defaultValue={receivedAt} disabled={busy} /></Label></div>
    <Label name="Original inquiry & form answers"><textarea className="input leading-relaxed" name="message" required maxLength={10000} rows={8} placeholder="Copy the client’s message and relevant form answers, including dates, budget, location, and service requested." disabled={busy} /></Label>
    <Label name="Office note"><textarea className="input" name="note" required maxLength={2000} rows={3} placeholder="Record the source checked and why this inquiry still needs a reply." disabled={busy} /></Label>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm leading-relaxed text-rose-800">{error}</p>}
    <div className="space-y-3 border-t border-ink-100 pt-4"><button className="btn-primary" disabled={busy || !selected}><Plus className="h-4 w-4" aria-hidden="true" />{busy ? "Adding inquiry…" : "Add to inquiry inbox"}</button><p className="text-xs leading-relaxed text-slate-500">No acknowledgement or client email is sent. Historical projects are only tracked when you add them explicitly.</p></div>
  </form>;
}
