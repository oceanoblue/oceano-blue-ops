"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  Clock3,
  FileCheck2,
  ListChecks,
  Loader2,
  RefreshCw,
  Send,
  Settings2,
  Users,
} from "lucide-react";
import {
  AGENT_LABELS,
  type AgentSettings as Settings,
  type BriefRun,
  type EmailDraft,
  type OperationsSnapshot,
  type WorkItem,
} from "@/lib/operations/types";
import { factualBrief } from "@/lib/operations/brief-text";
import { fmtDate, fmtTime } from "@/lib/utils/format";
import { MorningBrief } from "./MorningBrief";
import { InboxBrief } from "./InboxBrief";
import { DraftDialog } from "./DraftDialog";
import { editorDraft, workAction } from "@/lib/operations/actions";
import { AgentSettings } from "./AgentSettings";

function WorkCard({
  item,
  timezone,
  onDraft,
}: {
  item: WorkItem;
  timezone: string;
  onDraft: (draft: EmailDraft) => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300">
      <div className="flex flex-wrap gap-2 text-xs font-medium">
        {item.overdue && (
          <span className="rounded bg-rose-50 px-2 py-1 text-rose-700">
            Overdue
          </span>
        )}
        {item.rush && (
          <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">
            Priority
          </span>
        )}
        <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">
          {item.route === "internal"
            ? "In-house"
            : item.route === "external"
              ? "Outsourced"
              : "Unassigned"}
        </span>
      </div>
      <Link
        href={item.href}
        className="mt-3 flex items-start justify-between gap-2 text-base font-semibold text-ink-950 hover:text-blue-700"
      >
        <span>{item.title}</span>
        <ArrowUpRight aria-hidden className="mt-1 h-4 w-4 shrink-0" />
      </Link>
      <p className="mt-1 text-sm text-slate-500">{item.client}</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">{item.next}</p>
      {item.blockers.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-amber-300 pl-3 text-sm text-amber-900">
          {item.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
        <span
          className={
            item.overdue ? "font-medium text-rose-700" : "text-slate-500"
          }
        >
          {item.due ? `Due ${fmtDate(item.due, timezone)}` : "Set a deadline"}
        </span>
        <span className="text-slate-600">{item.editor || "Editor needed"}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary min-h-10 text-sm" onClick={() => onDraft(editorDraft(item))}>
          <Send className="h-4 w-4"/>{item.lane === "prepare" ? "Prepare handoff" : "Draft editor follow-up"}
        </button>
        <Link href={workAction(item).href} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-ocean-700">
          {workAction(item).label}<ArrowUpRight className="h-4 w-4"/>
        </Link>
      </div>
    </article>
  );
}

export function DailyOperations({
  name,
  snapshot,
  loadError,
  settings,
  settingsAvailable,
  scheduleSaved,
  runs,
  providers,
}: {
  name: string;
  snapshot: OperationsSnapshot | null;
  loadError: string | null;
  settings: Settings;
  settingsAvailable: boolean;
  scheduleSaved: boolean;
  runs: BriefRun[];
  providers: { openai: boolean; anthropic: boolean };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [route, setRoute] = useState("all");
  const [lane, setLane] = useState("prepare");
  const [activeRole, setActiveRole] = useState<
    "planner" | "handoff" | "delivery"
  >("planner");
  const latest = runs[0];
  const stale = !!latest && latest.local_date !== snapshot?.day;
  const todayRun = runs.find(
    (r) =>
      r.local_date === snapshot?.day &&
      ["completed", "partial"].includes(r.status),
  );
  const output = todayRun?.outputs.find((o) => o.role === activeRole);
  useEffect(() => {
    if (latest?.status !== "running") return;
    let ticks = 0;
    const timer = setInterval(() => {
      router.refresh();
      if (++ticks >= 24) clearInterval(timer);
    }, 5000);
    return () => clearInterval(timer);
  }, [latest?.id, latest?.status, router]);
  async function run() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/operations/brief", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.run.status === "failed")
        throw new Error(d.run.error || "Brief failed.");
      setNotice(
        d.run.status === "running"
          ? "Your briefing is running. This view will update."
          : "Brief saved. Refreshes are limited to one run per 15 minutes.",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Briefing failed.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Draft copied. Review the details before sharing.");
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the draft text.",
      );
    }
  }
  const items = snapshot?.items ?? [];
  const overdue = items.filter((i) => i.overdue);
  const handoffs = items.filter((i) => i.lane === "prepare");
  const dueToday = items.filter((i) => i.due === snapshot?.day);
  const ready = items.filter((i) => i.lane === "deliver");
  const lanes = [
    { id: "prepare", name: "To hand off", icon: Users },
    { id: "editing", name: "With editors", icon: Clock3 },
    { id: "review", name: "Needs review", icon: FileCheck2 },
    { id: "deliver", name: "Ready to deliver", icon: Send },
    { id: "other", name: "Upcoming / intake", icon: ListChecks },
  ];
  const filtered = items.filter(
    (i) => i.lane === lane && (route === "all" || i.route === route),
  );
  const dateLabel = snapshot
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${snapshot.day}T12:00:00Z`))
    : "Today";
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
      {draft && <DraftDialog initial={draft} canSave={snapshot?.inbox?.canDraft ?? false} onClose={() => setDraft(null)}/>}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {dateLabel} <span className="mx-2 text-slate-300">/</span>{" "}
            {settings.timezone.replace("America/", "").replaceAll("_", " ")}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
            Your day, in focus.
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#agents" className="btn-secondary min-h-11">
            <Settings2 className="h-4 w-4" />
            Assistants
          </a>
          <button
            type="button"
            onClick={() => void run()}
            disabled={
              busy ||
              latest?.status === "running" ||
              !settingsAvailable ||
              !snapshot
            }
            className="btn-primary min-h-11 disabled:opacity-50"
          >
            {busy || latest?.status === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {busy || latest?.status === "running"
              ? "Preparing brief…"
              : "Refresh brief"}
          </button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
        >
          {notice}
        </p>
      )}
      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-5"
        >
          <h2 className="font-semibold text-rose-900">
            Production data is unavailable
          </h2>
          <p className="mt-1 text-rose-800">{loadError}</p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() => router.refresh()}
          >
            Try again
          </button>
        </div>
      )}
      {snapshot && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Due today",
                count: dueToday.length,
                detail: "Commitments to finish",
                icon: CalendarDays,
                color: "text-blue-600",
                action: () =>
                  document
                    .getElementById("attention")
                    ?.scrollIntoView({ behavior: "smooth" }),
              },
              {
                label: "Editor handoffs",
                count: handoffs.length,
                detail: `${handoffs.filter((i) => i.route === "unassigned").length} need an editor`,
                icon: Users,
                color: "text-blue-600",
                action: () => setLane("prepare"),
              },
              {
                label: "Past deadline",
                count: overdue.length,
                detail: overdue.length
                  ? "Start with these today"
                  : "No overdue dates found",
                icon: CircleAlert,
                color: overdue.length ? "text-rose-600" : "text-slate-500",
                action: () =>
                  document
                    .getElementById("attention")
                    ?.scrollIntoView({ behavior: "smooth" }),
              },
              {
                label: "Ready to deliver",
                count: ready.length,
                detail: "Final checks, then release",
                icon: Send,
                color: "text-emerald-600",
                action: () => setLane("deliver"),
              },
            ].map((stat) => (
              <button
                key={stat.label}
                type="button"
                onClick={stat.action}
                className="rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-300"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">
                    {stat.label}
                  </span>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-ink-950">
                  {stat.count.toString().padStart(2, "0")}
                </p>
                <p className="mt-1 text-sm text-slate-500">{stat.detail}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
            <MorningBrief name={name} snapshot={snapshot} text={output?.text ?? factualBrief(activeRole, snapshot)} output={output} savedAt={todayRun?.created_at} role={activeRole} onRole={setActiveRole} onCopy={() => void copy(output?.text ?? factualBrief(activeRole, snapshot))}/>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-950">
                  <CalendarDays className="h-5 w-5 text-blue-600" />
                  On your calendar
                </h2>
                <Link
                  href="/dashboard/schedule"
                  className="text-sm font-medium text-blue-700"
                >
                  Open <span aria-hidden>↗</span>
                </Link>
              </div>
              <p
                className={`mt-2 text-sm ${snapshot.calendar.status === "connected" ? "text-slate-500" : "text-amber-800"}`}
              >
                {snapshot.calendar.message}
              </p>
              {snapshot.calendar.status !== "connected" && (
                <a
                  href="/dashboard/settings/integrations"
                  className="mt-2 inline-block text-sm font-semibold text-blue-700 underline"
                >
                  Connect or reconnect calendar
                </a>
              )}
              <div className="mt-5 max-h-[430px] space-y-4 overflow-y-auto">
                {snapshot.events.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-8 text-sm leading-relaxed text-slate-500">
                    {snapshot.calendar.status === "connected"
                      ? "No commitments found today in your primary calendar or production schedule."
                      : "Scheduled shoots will appear here. Your calendar availability is not yet verified."}
                  </div>
                ) : (
                  snapshot.events.map((e) => {
                    const conflict = snapshot.conflicts.some((pair) =>
                      pair.includes(e.id),
                    );
                    return (
                      <div
                        key={e.id}
                        className={`flex gap-4 rounded-lg border-l-2 pl-4 ${conflict ? "border-rose-400 bg-rose-50 py-3 pr-3" : "border-blue-300"}`}
                      >
                        <div className="w-20 shrink-0 text-sm font-medium text-slate-600">
                          {e.allDay
                            ? "All day"
                            : fmtTime(e.start, settings.timezone)}
                          {!e.allDay && (
                            <div className="mt-1 text-xs font-normal text-slate-400">
                              {fmtTime(e.end, settings.timezone)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-900">
                            {e.href ? (
                              <a
                                href={e.href}
                                className="hover:text-blue-700 hover:underline"
                              >
                                {e.title}
                              </a>
                            ) : (
                              e.title
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {e.source === "shoot"
                              ? "Production schedule"
                              : "Google Calendar"}
                            {e.location ? ` · ${e.location}` : ""}
                          </p>
                          {conflict && (
                            <p className="mt-1 text-sm font-medium text-rose-700">
                              Schedule overlap
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-400">
                Checked {fmtTime(snapshot.capturedAt, settings.timezone)} ·
                Primary calendar
              </p>
            </section>
          </div>
          <section
            id="attention"
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink-950">
                Needs your attention
              </h2>
              <Link
                className="text-sm font-medium text-blue-700"
                href="/dashboard/overview"
              >
                Full production overview ↗
              </Link>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {items
                .filter((i) => i.overdue || i.due === snapshot.day)
                .slice(0, 8)
                .map((i) => (
                  <Link
                    key={`${i.kind}:${i.id}`}
                    href={i.href}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${i.overdue ? "border-rose-100 bg-rose-50" : "border-slate-200 bg-slate-50"}`}
                  >
                    <span className="min-w-0">
                      <strong className="block text-sm text-ink-900">
                        {i.title}
                      </strong>
                      <span className="text-sm text-slate-600">
                        {i.overdue ? `Overdue · ${i.due}` : "Due today"} ·{" "}
                        {i.editor ?? "Owner to confirm"}
                      </span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500" />
                  </Link>
                ))}
              {!overdue.length && !dueToday.length && (
                <p className="text-sm text-slate-500">
                  No overdue or due-today items found. Undated work still needs
                  a deadline.
                </p>
              )}
            </div>
            {snapshot.warnings.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm text-amber-900">
                {snapshot.warnings.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <InboxBrief inbox={snapshot.inbox} timezone={settings.timezone} onDraft={setDraft}/>
          <section id="handoffs" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-ink-950">
                  Keep the work moving
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Every handoff, return, and delivery in one queue.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Editors
                <select
                  className="input min-h-11"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                >
                  <option value="all">All editors</option>
                  <option value="internal">In-house</option>
                  <option value="external">Outsourced</option>
                  <option value="unassigned">Unassigned</option>
                </select>
              </label>
            </div>
            <div
              role="group"
              aria-label="Production stage"
              className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
            >
              {lanes.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={lane === l.id}
                  onClick={() => setLane(l.id)}
                  className={`flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${lane === l.id ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
                >
                  <l.icon className="h-4 w-4" />
                  {l.name}
                  <span
                    className={`rounded px-1.5 text-xs ${lane === l.id ? "bg-white/20" : "bg-slate-100"}`}
                  >
                    {
                      items.filter(
                        (i) =>
                          i.lane === l.id &&
                          (route === "all" || i.route === route),
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            {filtered.length ? (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {filtered.map((item) => (
                  <WorkCard
                    key={`${item.kind}:${item.id}`}
                    item={item}
                    timezone={settings.timezone}
                    onDraft={setDraft}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                <FileCheck2 className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-3 font-medium text-slate-700">
                  Nothing in this queue
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Change the editor filter or open another production stage.
                </p>
              </div>
            )}
          </section>
        </>
      )}
      <AgentSettings
        initial={settings}
        available={settingsAvailable}
        providers={providers}
      />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink-950">
            Briefing history
          </h2>
          <span className="text-sm text-slate-500">
            {!settingsAvailable
              ? "Setup required"
              : !scheduleSaved
                ? "Save settings to schedule"
                : settings.enabled
                  ? `Daily at ${settings.brief_time}`
                  : "Automatic runs paused"}
          </span>
        </div>
        {stale && (
          <p className="mt-3 text-sm text-amber-800">
            The latest saved briefing is from {fmtDate(latest.local_date)}.
            Today’s summary above uses live facts.
          </p>
        )}
        {latest?.status === "failed" && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {latest.error} Manual refresh is available once every 15 minutes.
          </p>
        )}
        {!runs.length ? (
          <p className="mt-4 text-sm text-slate-500">
            No saved runs yet. Refresh the brief to generate your first one.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {runs.map((r) => (
              <details key={r.id} className="py-3">
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium text-slate-800">
                    {fmtDate(r.local_date)} ·{" "}
                    {fmtTime(r.created_at, settings.timezone)}
                  </span>
                  <span className="ml-3 text-slate-500">
                    {r.run_key === "daily" ? "Scheduled" : "Manual"} ·{" "}
                    {r.status === "partial" ? "Completed with gaps" : r.status}
                  </span>
                </summary>
                <div className="mt-3 space-y-4 rounded-xl bg-slate-50 p-4">
                  {r.error && (
                    <p className="text-sm text-rose-700">{r.error}</p>
                  )}
                  {r.outputs.map((o) => (
                    <div key={o.role}>
                      <h3 className="text-sm font-semibold">
                        {AGENT_LABELS[o.role]} ·{" "}
                        {o.status === "fallback"
                          ? "Factual fallback"
                          : o.model || "Built-in rules"}
                      </h3>
                      {o.error && (
                        <p className="mt-1 text-sm text-amber-800">{o.error}</p>
                      )}
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                        {o.text}
                      </p>
                      {o.inputTokens !== undefined &&
                        o.provider !== "rules" && (
                          <p className="mt-2 text-xs text-slate-400">
                            {o.inputTokens} input tokens · {o.outputTokens}{" "}
                            output tokens
                          </p>
                        )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
