import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FileSignature, ImageOff, Megaphone, Send, Users } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { AccountList } from "@/components/social-studio/AccountList";
import { ReportLink } from "@/components/social-studio/ClientLinks";
import { CopyMediaAsk, PlanMonth } from "@/components/social-studio/ProgramSetup";
import { OnboardingChecklist } from "@/components/social-studio/ProgramTerms";
import { StudioFrame } from "@/components/social-studio/StudioFrame";
import { accountHref, appOrigin, clientHref } from "@/lib/social/links";
import { clientPage } from "@/lib/social/page";
import {
  ACCESS_LABEL,
  ACCESS_PILL,
  AGREEMENT_LABEL,
  AGREEMENT_PILL,
  DONE,
  KIND_LABEL,
  MEDIA_HEALTH_LABEL,
  MEDIA_HEALTH_PILL,
  STATUS_LABEL,
  STATUS_PILL,
  formatCents,
  monthLabel,
  shortDate,
  termEndLabel,
} from "@/lib/social/schema";
import { listAgreements } from "@/lib/social/server";

export const dynamic = "force-dynamic";

/** One client's dashboard: the month in numbers, what needs attention, what is coming up, and every sub-account. */
export default async function ClientDashboardPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { program, month, today, workspace, rows, summary, production } = await clientPage(props.params, props.searchParams);
  const agreements = await listAgreements(program.id).catch(() => []);
  const agreement = agreements.find((a) => a.status !== "void") ?? null;

  const names = new Map(workspace.accounts.map((a) => [a.id, a.name]));
  const weekOut = new Date(`${today}T12:00:00Z`);
  weekOut.setUTCDate(weekOut.getUTCDate() + 7);
  const until = weekOut.toISOString().slice(0, 10);
  const upcoming = workspace.items
    .filter((i) => i.scheduled_for && i.scheduled_for >= today && i.scheduled_for <= until && !DONE.includes(i.status))
    .sort((a, b) => (a.scheduled_for! < b.scheduled_for! ? -1 : a.scheduled_for! > b.scheduled_for! ? 1 : 0))
    .slice(0, 8);

  const shortOnMedia = rows.filter((r) => r.health !== "good");
  const needsAttention = rows.filter((r) => r.health !== "good" || r.account.access_status !== "connected" || r.requests.length > 0);
  const ask = [
    `Media we need for ${program.name}:`,
    ...shortOnMedia.map((r) => `- ${r.account.name}: ${r.health === "out" ? "new photos and short video clips needed now" : "running low, more photos and clips within 30 days"}`),
    ...workspace.requests.map((r) => `- ${names.get(r.account_id) ?? "Sub-account"}: ${r.ask}${r.due_on ? ` (by ${r.due_on})` : ""}`),
  ].join("\n");
  const terms = [
    program.monthly_fee_cents > 0 && `${formatCents(program.monthly_fee_cents)} a month`,
    program.term_start && program.term_months > 0 && `${monthLabel(program.term_start.slice(0, 7))} to ${termEndLabel(program.term_start, program.term_months)}`,
  ].filter(Boolean);

  return (
    <StudioFrame view="dashboard" program={program} month={month} production={production} accountCount={summary.accounts} checkErrors={summary.errors}>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Sub-accounts" value={summary.accounts} icon={Users} href={clientHref("accounts", program.id, month)} />
        <StatCard label="Planned" value={`${summary.planned} / ${summary.owed}`} hint={`pieces for ${monthLabel(month)}`} icon={Megaphone} />
        <StatCard label="In production" value={summary.inProduction} icon={Clock} href={clientHref("board", program.id, month)} />
        <StatCard label="With client" value={summary.withClient} icon={Send} href={clientHref("board", program.id, month)} />
        <StatCard label="Scheduled or live" value={summary.done} hint={summary.owed > 0 ? `${summary.percentDone}% of the month` : undefined} icon={CheckCircle2} accent />
        <StatCard label="To fix" value={summary.errors} hint={summary.late > 0 ? `${summary.late} late` : undefined} icon={AlertTriangle} href={clientHref("checks", program.id, month)} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ocean-950">Needs attention</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {needsAttention.length === 0
                  ? "Media, access and requests are in good shape for every sub-account."
                  : `${shortOnMedia.length} short on media, ${summary.accessProblems} access not confirmed, ${summary.openRequests} open media ${summary.openRequests === 1 ? "request" : "requests"}.`}
              </p>
            </div>
            {(shortOnMedia.length > 0 || workspace.requests.length > 0) && <CopyMediaAsk text={ask} />}
          </div>
          {needsAttention.length > 0 && (
            <ul className="mt-4 space-y-2">
              {needsAttention.slice(0, 6).map((r) => (
                <li key={r.account.id}>
                  <Link href={accountHref(r.account.id, month)} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 ring-1 ring-ink-100 hover:bg-ink-50">
                    <span className="truncate text-sm font-medium text-ink-900">{r.account.name}</span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {r.health !== "good" && (
                        <span className={`pill ${MEDIA_HEALTH_PILL[r.health]}`}>
                          <ImageOff className="mr-1 h-3 w-3" aria-hidden="true" />
                          {MEDIA_HEALTH_LABEL[r.health]}
                        </span>
                      )}
                      {r.account.access_status !== "connected" && <span className={`pill ${ACCESS_PILL[r.account.access_status]}`}>{ACCESS_LABEL[r.account.access_status]}</span>}
                    </span>
                  </Link>
                </li>
              ))}
              {needsAttention.length > 6 && (
                <li>
                  <Link href={clientHref("accounts", program.id, month)} className="inline-flex items-center gap-1 px-3 text-sm font-semibold text-ocean-700 hover:underline">
                    {needsAttention.length - 6} more in Sub-accounts <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </li>
              )}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-display text-lg font-semibold text-ocean-950">Coming up in the next 7 days</h2>
          {upcoming.length === 0 ? (
            <p className="mt-0.5 text-sm text-slate-600">Nothing still in production is due in the next 7 days.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {upcoming.map((i) => (
                <li key={i.id}>
                  <Link href={accountHref(i.account_id, month)} className="flex items-center justify-between gap-3 py-2 hover:bg-ink-50/70">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">{i.title || KIND_LABEL[i.kind]}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {shortDate(i.scheduled_for)} · {names.get(i.account_id) ?? "Sub-account"}
                      </span>
                    </span>
                    <span className={`pill shrink-0 ${STATUS_PILL[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <PlanMonth program={program} month={month} accountCount={summary.accounts} planned={summary.planned} owed={summary.owed} />
      <OnboardingChecklist key={`onboarding-${program.id}`} program={program} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ReportLink program={program} origin={appOrigin()} />
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ocean-950">Agreement and terms</h2>
              <p className="mt-0.5 text-sm text-slate-600">{terms.length ? terms.join(" · ") : "No fee or term saved yet."}</p>
            </div>
            {agreement ? <span className={`pill ${AGREEMENT_PILL[agreement.status]}`}>{AGREEMENT_LABEL[agreement.status]}</span> : <span className="pill bg-slate-100 text-slate-700">No agreement yet</span>}
          </div>
          <Link href={clientHref("agreement", program.id)} className="btn-secondary mt-4">
            <FileSignature className="h-4 w-4" aria-hidden="true" /> Open agreement and terms
          </Link>
        </section>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3 pt-2">
        <h2 className="font-display text-xl font-semibold text-ocean-950">
          Sub-accounts <span className="text-base font-normal text-slate-500">({summary.accounts})</span>
        </h2>
        <Link href={clientHref("accounts", program.id, month)} className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:underline">
          Manage sub-accounts <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="card p-5 text-sm text-slate-600">
          {program.name} has no sub-accounts yet. Add its hotels, outlets or brand pages in{" "}
          <Link href={clientHref("accounts", program.id, month)} className="font-semibold text-ocean-700 hover:underline">
            Sub-accounts
          </Link>
          .
        </p>
      ) : (
        <AccountList rows={rows} month={month} />
      )}
    </StudioFrame>
  );
}
