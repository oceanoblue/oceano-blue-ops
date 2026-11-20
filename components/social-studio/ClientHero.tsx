import { monthLabel } from "@/lib/social/schema";
import type { Program } from "@/lib/social/server";
import type { ClientSummary } from "@/lib/social/summary";
import { Meter } from "./Charts";
import { LogoUploader } from "./LogoUploader";

const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const STATUS_TONE: Record<Program["status"], string> = {
  prospect: "bg-white/10 text-ink-100 ring-white/20",
  onboarding: "bg-amber-400/15 text-amber-200 ring-amber-300/30",
  active: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30",
  paused: "bg-white/10 text-ink-100 ring-white/20",
  ended: "bg-white/10 text-ink-300 ring-white/15",
};

/**
 * The top of a client's dashboard: who the client is, with its logo, and the
 * one number that says how the month is going.
 */
export function ClientHero({ program, summary, month }: { program: Program; summary: ClientSummary; month: string }) {
  const facts = [
    { label: "Sub-accounts", value: String(summary.accounts) },
    { label: "Pieces this month", value: String(summary.owed) },
    { label: "With the client", value: String(summary.withClient) },
    { label: "To fix", value: String(summary.errors) },
  ];
  return (
    <header className="relative overflow-hidden rounded-2xl bg-ink-950 text-white shadow-lift">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-48 h-[30rem] w-[30rem] rounded-full bg-ocean-600/30 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-56 left-1/4 h-[24rem] w-[24rem] rounded-full bg-ocean-400/10 blur-3xl" />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
          <LogoUploader target="client" id={program.id} name={program.name} url={program.logo_url} size="xl" tone="dark" />
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean-300">Client</p>
            <h1 className="mt-1 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{program.name}</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-200">
              {[program.contact_name && `Contact: ${program.contact_name}`, program.publishing_tool && `Published from ${program.publishing_tool}`].filter(Boolean).join(" · ") ||
                "Add a contact and publishing tool on the Agreement tab."}
            </p>
            <span className={`mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_TONE[program.status]}`}>{humanize(program.status)}</span>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-sm text-ink-200">{monthLabel(month)}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="text-5xl font-bold leading-none tracking-tight sm:text-6xl">{summary.percentDone}%</span>
            <span className="text-sm text-ink-100">
              scheduled or live, {summary.done} of {summary.owed} pieces
            </span>
          </p>
          <div className="mt-4">
            <Meter
              dark
              thick
              done={summary.done}
              inProgress={Math.max(0, summary.planned - summary.done)}
              total={summary.owed}
              label={`${summary.done} of ${summary.owed} pieces scheduled or live, ${Math.max(0, summary.planned - summary.done)} more in production`}
            />
            <p className="mt-2 text-xs text-ink-300">
              {summary.planned === 0
                ? "Nothing is planned for this month yet."
                : `${Math.max(0, summary.planned - summary.done)} more in production${summary.owed > summary.planned ? `, ${summary.owed - summary.planned} not planned yet` : ""}`}
            </p>
          </div>
        </div>
      </div>

      <dl className="relative grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
        {facts.map((f, i) => (
          <div key={f.label} className={`px-6 py-4 sm:px-8 ${i % 2 === 1 ? "border-l border-white/10" : ""} ${i >= 2 ? "border-t border-white/10 sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
            <dt className="font-mono text-[10px] font-medium uppercase tracking-wider text-ink-300">{f.label}</dt>
            <dd className="mt-1 text-2xl font-bold">{f.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
