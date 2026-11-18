import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, ImageOff, Megaphone, Send, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { StudioFrame } from "@/components/social-studio/StudioFrame";
import { CopyMediaAsk, NewProgramForm, ProgramSetup } from "@/components/social-studio/ProgramSetup";
import { accountHref, studioHref } from "@/lib/social/links";
import { studioPage } from "@/lib/social/page";
import {
  ACCESS_LABEL,
  ACCESS_PILL,
  DONE,
  IN_PRODUCTION,
  MEDIA_HEALTH_LABEL,
  MEDIA_HEALTH_PILL,
  PLATFORM_LABEL,
  STATUSES,
  STATUS_BAR,
  STATUS_LABEL,
  TIERS,
  TIER_LABEL,
  countByStatus,
  isLate,
  mediaHealth,
  monthLabel,
  quotaTotal,
  sumOf,
  todayKey,
} from "@/lib/social/schema";

export const dynamic = "force-dynamic";

export default async function SocialStudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { programs, program, month, workspace, production } = await studioPage(searchParams);

  if (!programs)
    return (
      <StudioFrame view="overview" programs={[]} program={null} month={month} production={production}>
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Social Studio couldn&apos;t be loaded. If this page is new, the database update for it may not be installed yet.
        </p>
      </StudioFrame>
    );
  if (!program || !workspace)
    return (
      <StudioFrame view="overview" programs={programs} program={null} month={month} production={production}>
        <div className="card mx-auto max-w-2xl p-6">
          <EmptyState compact icon={Megaphone} title="No social media programs yet" description="A program is one client engagement. Create it, add the client's accounts, then plan the month." />
          <NewProgramForm />
        </div>
      </StudioFrame>
    );

  const today = todayKey();
  const active = workspace.accounts.filter((a) => a.is_active);
  const rows = active.map((account) => {
    const items = workspace.items.filter((i) => i.account_id === account.id);
    const recent = workspace.media.filter((m) => m.account_id === account.id);
    return {
      account,
      counts: countByStatus(items),
      planned: items.length,
      owed: quotaTotal(account),
      late: items.filter((i) => isLate(i, today)).length,
      health: mediaHealth(account, {
        photos: recent.reduce((n, m) => n + m.photos, 0),
        videos: recent.reduce((n, m) => n + m.videos, 0),
      }),
      requests: workspace.requests.filter((r) => r.account_id === account.id),
    };
  });
  const totals = countByStatus(workspace.items);
  const owed = rows.reduce((n, r) => n + r.owed, 0);
  const planned = rows.reduce((n, r) => n + r.planned, 0);
  const done = sumOf(totals, DONE);
  const late = rows.reduce((n, r) => n + r.late, 0);
  const shortOnMedia = rows.filter((r) => r.health !== "good");
  const accessProblems = rows.filter((r) => r.account.access_status !== "connected");
  const ask = [
    `Media we need for ${program.name}:`,
    ...shortOnMedia.map((r) => `- ${r.account.name}: ${r.health === "out" ? "new photos and short video clips needed now" : "running low, more photos and clips within 30 days"}`),
    ...workspace.requests.map((r) => `- ${active.find((a) => a.id === r.account_id)?.name ?? "Account"}: ${r.ask}${r.due_on ? ` (by ${r.due_on})` : ""}`),
  ].join("\n");

  return (
    <StudioFrame view="overview" programs={programs} program={program} month={month} production={production}>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Accounts" value={active.length} icon={Users} />
        <StatCard label="Planned" value={`${planned} / ${owed}`} hint={`pieces for ${monthLabel(month)}`} icon={Megaphone} />
        <StatCard label="In production" value={sumOf(totals, IN_PRODUCTION)} icon={Clock} href={studioHref("board", program.id, month)} />
        <StatCard label="With client" value={totals.client_review} icon={Send} href={studioHref("board", program.id, month)} />
        <StatCard label="Scheduled or live" value={done} hint={owed > 0 ? `${Math.round((done / owed) * 100)}% of the month` : undefined} icon={CheckCircle2} accent />
        <StatCard label="Late" value={late} icon={AlertTriangle} href={studioHref("calendar", program.id, month)} />
      </div>

      {(shortOnMedia.length > 0 || accessProblems.length > 0 || workspace.requests.length > 0) && (
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ocean-950">Needs attention</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {shortOnMedia.length} {shortOnMedia.length === 1 ? "account is" : "accounts are"} short on media, {accessProblems.length} not connected, {workspace.requests.length} open media {workspace.requests.length === 1 ? "request" : "requests"}.
              </p>
            </div>
            {(shortOnMedia.length > 0 || workspace.requests.length > 0) && <CopyMediaAsk text={ask} />}
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rows
              .filter((r) => r.health !== "good" || r.account.access_status !== "connected" || r.requests.length > 0)
              .slice(0, 12)
              .map((r) => (
                <li key={r.account.id}>
                  <Link href={accountHref(r.account.id, month)} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 ring-1 ring-ink-100 hover:bg-ink-50">
                    <span className="truncate text-sm font-medium text-ink-900">{r.account.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {r.health !== "good" && <span className={`pill ${MEDIA_HEALTH_PILL[r.health]}`}><ImageOff className="mr-1 h-3 w-3" aria-hidden="true" />{MEDIA_HEALTH_LABEL[r.health]}</span>}
                      {r.account.access_status !== "connected" && <span className={`pill ${ACCESS_PILL[r.account.access_status]}`}>{ACCESS_LABEL[r.account.access_status]}</span>}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

      <ProgramSetup program={program} month={month} accountCount={active.length} planned={planned} owed={owed} />

      {TIERS.map((tier) => {
        const group = rows.filter((r) => r.account.tier === tier);
        if (group.length === 0) return null;
        return (
          <section key={tier} className="card overflow-hidden">
            <header className="flex items-baseline justify-between gap-3 border-b border-ink-100 px-5 py-3">
              <h2 className="font-display text-lg font-semibold text-ocean-950">{TIER_LABEL[tier]} accounts</h2>
              <span className="text-sm text-slate-500">{group.length}</span>
            </header>
            <ul className="divide-y divide-ink-100">
              {group.map((r) => (
                <li key={r.account.id}>
                  <Link href={accountHref(r.account.id, month)} className="grid items-center gap-3 px-5 py-3 hover:bg-ink-50/70 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_auto]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-900">{r.account.name}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {r.account.platforms.map((p) => PLATFORM_LABEL[p]).join(" · ") || "No platforms set"}
                      </div>
                    </div>
                    <div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={STATUSES.filter((s) => r.counts[s] > 0).map((s) => `${r.counts[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(", ") || "Nothing planned"}>
                        {STATUSES.map((s) =>
                          r.counts[s] > 0 ? <span key={s} className={STATUS_BAR[s]} style={{ width: `${(r.counts[s] / Math.max(r.owed, r.planned, 1)) * 100}%` }} /> : null,
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {sumOf(r.counts, DONE)} of {r.owed} scheduled or live
                        {r.planned < r.owed && ` · ${r.owed - r.planned} not planned`}
                        {r.late > 0 && <span className="font-semibold text-rose-700"> · {r.late} late</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 md:justify-end">
                      <span className={`pill ${MEDIA_HEALTH_PILL[r.health]}`}>{MEDIA_HEALTH_LABEL[r.health]}</span>
                      <span className={`pill ${ACCESS_PILL[r.account.access_status]}`}>{ACCESS_LABEL[r.account.access_status]}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </StudioFrame>
  );
}
