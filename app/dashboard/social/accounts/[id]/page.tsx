import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { crmActor } from "@/lib/crm/server";
import { AccountItems, AccountProfile, MediaLog, MediaRequests } from "@/components/social-studio/AccountPanel";
import { auditMonth } from "@/lib/social/audit";
import { Breadcrumbs } from "@/components/social-studio/StudioFrame";
import { SOCIAL_HOME, accountHref, clientHref } from "@/lib/social/links";
import { loadAccount, mediaWindowStart } from "@/lib/social/server";
import {
  ACCESS_LABEL,
  ACCESS_PILL,
  DONE,
  PLATFORM_LABEL,
  TIER_LABEL,
  countByStatus,
  mediaHealth,
  monthLabel,
  parseMonth,
  quotaTotal,
  shiftMonth,
  sumOf,
  todayKey,
} from "@/lib/social/schema";

export const dynamic = "force-dynamic";

export default async function AccountPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await crmActor();
  } catch {
    notFound();
  }
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const month = parseMonth((await props.searchParams).month);
  const detail = await loadAccount(id, month).catch(() => null);
  if (!detail) notFound();
  const { account, program, items, media, requests, team } = detail;
  const today = todayKey();
  const windowStart = mediaWindowStart(today);
  const recent = media.filter((m) => m.received_on >= windowStart);
  const health = mediaHealth(account, {
    photos: recent.reduce((n, m) => n + m.photos, 0),
    videos: recent.reduce((n, m) => n + m.videos, 0),
  });
  const counts = countByStatus(items);
  const audit = auditMonth(items, [account], program.avoid_terms, today);
  const links = account.platforms.filter((p) => account.profile_links[p]);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          trail={[
            { label: "Social Media", href: SOCIAL_HOME },
            { label: program.name, href: clientHref("dashboard", program.id, month) },
            { label: "Sub-accounts", href: clientHref("accounts", program.id, month) },
            { label: account.name },
          ]}
        />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-ink-100/70 pb-5">
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean-600">{TIER_LABEL[account.tier]} sub-account of {program.name}</div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ocean-950 sm:text-3xl">{account.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className={`pill ${ACCESS_PILL[account.access_status]}`}>{ACCESS_LABEL[account.access_status]}</span>
              {links.map((p) => (
                <a key={p} href={account.profile_links[p]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-ocean-700 hover:underline">
                  {PLATFORM_LABEL[p]} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ))}
              {account.brand_kit_url && (
                <a href={account.brand_kit_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-fuchsia-700 hover:underline">
                  Canva brand kit <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link href={accountHref(account.id, shiftMonth(month, -1))} className="btn-ghost px-2" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span className="min-w-36 text-center font-display text-base font-semibold text-ocean-950">{monthLabel(month)}</span>
            <Link href={accountHref(account.id, shiftMonth(month, 1))} className="btn-ghost px-2" aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <header className="flex items-baseline justify-between gap-3 border-b border-ink-100 px-5 py-3">
              <h2 className="font-display text-lg font-semibold text-ocean-950">Content for {monthLabel(month)}</h2>
              <span className="text-sm text-slate-500">{sumOf(counts, DONE)} of {quotaTotal(account)} scheduled or live</span>
            </header>
            <AccountItems items={items} account={account} team={team} today={today} audit={audit} />
          </section>
          <section className="card overflow-hidden">
            <header className="border-b border-ink-100 px-5 py-3">
              <h2 className="font-display text-lg font-semibold text-ocean-950">Media library</h2>
              <p className="mt-0.5 text-sm text-slate-600">Log what arrives so we know when this sub-account is running short. Files stay in the client&apos;s folder.</p>
            </header>
            <MediaLog account={account} media={media} health={health} today={today} />
          </section>
          <section className="card overflow-hidden">
            <header className="border-b border-ink-100 px-5 py-3">
              <h2 className="font-display text-lg font-semibold text-ocean-950">Media requests</h2>
            </header>
            <MediaRequests account={account} requests={requests} />
          </section>
        </div>
        <section className="card self-start overflow-hidden">
          <header className="border-b border-ink-100 px-5 py-3">
            <h2 className="font-display text-lg font-semibold text-ocean-950">Sub-account profile</h2>
          </header>
          <AccountProfile key={account.id} account={account} />
        </section>
      </div>
    </div>
  );
}
