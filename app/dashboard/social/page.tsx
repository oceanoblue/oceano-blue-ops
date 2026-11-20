import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Megaphone, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { NewProgramForm } from "@/components/social-studio/ProgramSetup";
import { ClientStatusPill, SocialHomeFrame } from "@/components/social-studio/StudioFrame";
import { clientHref } from "@/lib/social/links";
import { legacyTarget, socialHome, type ClientCard } from "@/lib/social/page";
import { formatCents, monthLabel } from "@/lib/social/schema";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Social Media front page: one card per client. Each card opens that client's own dashboard. */
export default async function SocialClientsPage({ searchParams }: { searchParams: Search }) {
  // Links saved before clients had their own pages carried the client in the address.
  const legacy = await legacyTarget(searchParams);
  if (legacy.clientId) redirect(clientHref("dashboard", legacy.clientId, legacy.month));

  const { clients, month, production } = await socialHome(searchParams);

  if (!clients)
    return (
      <SocialHomeFrame production={production}>
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Social Media couldn&apos;t be loaded. If this page is new, the database update for it may not be installed yet.
        </p>
      </SocialHomeFrame>
    );

  if (clients.length === 0)
    return (
      <SocialHomeFrame production={production}>
        <div className="card mx-auto max-w-2xl p-6">
          <EmptyState compact icon={Megaphone} title="No social media clients yet" description="Add the client first. Then add their hotels, outlets or brand pages as sub-accounts and plan the month." />
          <NewProgramForm />
        </div>
      </SocialHomeFrame>
    );

  const live = clients.filter((c) => c.program.status !== "ended");
  const total = (pick: (c: ClientCard) => number) => live.reduce((n, c) => n + pick(c), 0);
  const owed = total((c) => c.summary.owed);
  const done = total((c) => c.summary.done);

  return (
    <SocialHomeFrame production={production}>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clients" value={live.length} icon={Building2} />
        <StatCard label="Sub-accounts" value={total((c) => c.summary.accounts)} icon={Users} />
        <StatCard label="Scheduled or live" value={`${done} / ${owed}`} hint={`pieces for ${monthLabel(month)}`} icon={CheckCircle2} accent />
        <StatCard label="To fix" value={total((c) => c.summary.errors)} hint="failed checks, all clients" icon={AlertTriangle} />
      </div>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {clients.map(({ program, summary }) => {
          const flags = [
            summary.errors > 0 && { text: `${summary.errors} to fix`, tone: "bg-rose-100 text-rose-800" },
            summary.late > 0 && { text: `${summary.late} late`, tone: "bg-rose-100 text-rose-800" },
            summary.outOfMedia + summary.lowOnMedia > 0 && { text: `${summary.outOfMedia + summary.lowOnMedia} short on media`, tone: "bg-amber-100 text-amber-800" },
            summary.accessProblems > 0 && { text: `${summary.accessProblems} access not confirmed`, tone: "bg-amber-100 text-amber-800" },
            summary.withClient > 0 && { text: `${summary.withClient} with the client`, tone: "bg-sky-100 text-sky-800" },
          ].filter((f): f is { text: string; tone: string } => Boolean(f));
          return (
            <li key={program.id}>
              <Link href={clientHref("dashboard", program.id, month)} className="card card-interactive block p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-to-br from-ocean-500 to-ocean-700 text-white shadow-soft">
                      <Building2 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-xl font-semibold leading-snug text-ocean-950">{program.name}</h2>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {summary.accounts} {summary.accounts === 1 ? "sub-account" : "sub-accounts"}
                        {program.monthly_fee_cents > 0 && ` · ${formatCents(program.monthly_fee_cents)} a month`}
                        {program.contact_name && ` · ${program.contact_name}`}
                      </p>
                    </div>
                  </div>
                  <ClientStatusPill status={program.status} />
                </div>

                <div className="mt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-medium text-ink-900">{monthLabel(month)}</span>
                    <span className="tabular-nums text-slate-600">
                      {summary.done} of {summary.owed} scheduled or live
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${summary.percentDone}% of the month is scheduled or live`}>
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${summary.percentDone}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {summary.planned === 0
                      ? "Nothing planned for this month yet."
                      : `${summary.planned} planned · ${summary.inProduction} in production · ${summary.approved} approved`}
                    {summary.onboardingDone < summary.onboardingTotal && ` · Onboarding ${summary.onboardingDone} of ${summary.onboardingTotal}`}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {flags.length === 0 ? <span className="pill bg-emerald-100 text-emerald-800">Nothing needs attention</span> : flags.map((f) => <span key={f.text} className={`pill ${f.tone}`}>{f.text}</span>)}
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-700">
                    Open dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="card">
        <details className="p-5">
          <summary className="cursor-pointer text-sm font-semibold text-ocean-800">Add a client</summary>
          <div className="mt-4 max-w-2xl">
            <NewProgramForm />
          </div>
        </details>
      </section>
    </SocialHomeFrame>
  );
}
