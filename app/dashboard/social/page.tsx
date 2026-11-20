import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Megaphone, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { Meter } from "@/components/social-studio/Charts";
import { SocialLogo } from "@/components/social-studio/Logo";
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
            summary.late > 0 && { text: `${summary.late} late`, tone: "bg-rose-100 text-rose-800" },
            program.status === "onboarding" && summary.onboardingDone < summary.onboardingTotal && { text: `Onboarding ${summary.onboardingDone} of ${summary.onboardingTotal}`, tone: "bg-slate-100 text-slate-700" },
            summary.outOfMedia + summary.lowOnMedia > 0 && { text: `${summary.outOfMedia + summary.lowOnMedia} short on media`, tone: "bg-amber-100 text-amber-800" },
            summary.accessProblems > 0 && { text: `${summary.accessProblems} access not confirmed`, tone: "bg-amber-100 text-amber-800" },
            summary.withClient > 0 && { text: `${summary.withClient} with the client`, tone: "bg-sky-100 text-sky-800" },
          ].filter((f): f is { text: string; tone: string } => Boolean(f));
          return (
            <li key={program.id}>
              <Link href={clientHref("dashboard", program.id, month)} className="card card-interactive block overflow-hidden">
                <div className="relative bg-ink-950 p-5 text-white">
                  <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 h-64 w-64 rounded-full bg-ocean-600/30 blur-3xl" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-4">
                      <SocialLogo name={program.name} url={program.logo_url} size="lg" />
                      <div className="min-w-0">
                        <h2 className="font-display text-xl font-semibold leading-snug sm:text-2xl">{program.name}</h2>
                        <p className="mt-0.5 text-sm text-ink-200">
                          {[program.contact_name, program.monthly_fee_cents > 0 && `${formatCents(program.monthly_fee_cents)} a month`].filter(Boolean).join(" · ") || "Social media client"}
                        </p>
                      </div>
                    </div>
                    <ClientStatusPill status={program.status} />
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-medium text-ink-900">{monthLabel(month)}</span>
                    <span className="text-slate-600">
                      <span className="font-semibold tabular-nums text-ink-900">
                        {summary.done} of {summary.owed}
                      </span>{" "}
                      scheduled or live
                    </span>
                  </div>
                  <div className="mt-2">
                    <Meter
                      thick
                      done={summary.done}
                      inProgress={Math.max(0, summary.planned - summary.done)}
                      total={summary.owed}
                      label={`${summary.done} of ${summary.owed} pieces scheduled or live, ${Math.max(0, summary.planned - summary.done)} in production`}
                    />
                  </div>

                  <dl className="mt-4 grid grid-cols-3 divide-x divide-ink-100 rounded-xl bg-ink-50/70 ring-1 ring-ink-100">
                    {[
                      { label: "Sub-accounts", value: summary.accounts },
                      { label: "In production", value: Math.max(0, summary.planned - summary.done) },
                      { label: "To fix", value: summary.errors },
                    ].map((f) => (
                      <div key={f.label} className="px-3 py-2.5">
                        <dt className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-500">{f.label}</dt>
                        <dd className="mt-0.5 text-xl font-bold text-ocean-950">{f.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      {flags.length === 0 ? <span className="pill bg-emerald-100 text-emerald-800">Nothing needs attention</span> : flags.map((f) => <span key={f.text} className={`pill ${f.tone}`}>{f.text}</span>)}
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-700">
                      Open dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
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
