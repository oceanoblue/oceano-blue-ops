import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Facebook, ImageOff, Instagram, KeyRound, Linkedin, Youtube } from "lucide-react";
import { accountHref } from "@/lib/social/links";
import { ACCESS_LABEL, MEDIA_HEALTH_LABEL, PLATFORM_LABEL, TIERS, TIER_LABEL, type Platform } from "@/lib/social/schema";
import type { AccountRow } from "@/lib/social/summary";
import { Meter } from "./Charts";
import { SocialLogo } from "./Logo";

const ICON: Partial<Record<Platform, typeof Facebook>> = { facebook: Facebook, instagram: Instagram, linkedin: Linkedin, youtube: Youtube };
const SHORT: Partial<Record<Platform, string>> = { google: "Google", x: "X", tiktok: "TikTok" };

/** The platforms a sub-account posts on, as small icons. Each has its name for screen readers and on hover. */
export function PlatformIcons({ platforms }: { platforms: Platform[] }) {
  if (platforms.length === 0) return <span className="text-xs text-slate-400">No platforms set</span>;
  return (
    <ul className="flex flex-wrap items-center gap-1.5 text-slate-500">
      {platforms.map((p) => {
        const Icon = ICON[p];
        return (
          <li key={p} title={PLATFORM_LABEL[p]}>
            {Icon ? (
              <>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{PLATFORM_LABEL[p]}</span>
              </>
            ) : (
              <span className="rounded bg-ink-100 px-1 py-0.5 text-[10px] font-semibold leading-none text-slate-600">{SHORT[p] ?? PLATFORM_LABEL[p]}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One sub-account as a card: logo, where it posts, the month's progress and anything that needs attention. */
function AccountCard({ row, month }: { row: AccountRow; month: string }) {
  const { account } = row;
  const inProgress = Math.max(0, row.planned - row.done);
  const flags = [
    row.errors > 0 && { icon: AlertTriangle, text: `${row.errors} to fix`, tone: "bg-rose-50 text-rose-800 ring-rose-200" },
    row.late > 0 && { icon: Clock, text: `${row.late} late`, tone: "bg-rose-50 text-rose-800 ring-rose-200" },
    row.health !== "good" && { icon: ImageOff, text: MEDIA_HEALTH_LABEL[row.health], tone: row.health === "out" ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200" },
    account.access_status !== "connected" && {
      icon: KeyRound,
      text: ACCESS_LABEL[account.access_status],
      tone: account.access_status === "issue" ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200",
    },
  ].filter((f): f is { icon: typeof Clock; text: string; tone: string } => Boolean(f));
  return (
    <Link href={accountHref(account.id, month)} className="card card-interactive flex h-full min-w-0 flex-col p-4">
      <div className="flex min-w-0 items-start gap-3">
        <SocialLogo name={account.name} url={account.logo_url} size="md" />
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900">{account.name}</h4>
          <div className="mt-1.5">
            <PlatformIcons platforms={account.platforms} />
          </div>
        </div>
      </div>
      <div className="mt-4">
        <Meter done={row.done} inProgress={inProgress} total={row.owed} label={`${row.done} of ${row.owed} scheduled or live, ${inProgress} in production`} />
        <p className="mt-1.5 text-xs text-slate-600">
          <span className="font-semibold tabular-nums text-ink-900">
            {row.done} of {row.owed}
          </span>{" "}
          scheduled or live
          {row.planned === 0 ? " · nothing planned" : inProgress > 0 ? ` · ${inProgress} in production` : ""}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {flags.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Media and access are fine
          </span>
        ) : (
          flags.map((f) => (
            <span key={f.text} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${f.tone}`}>
              <f.icon className="h-3 w-3" aria-hidden="true" /> {f.text}
            </span>
          ))
        )}
      </div>
    </Link>
  );
}

/** A client's sub-accounts as cards, grouped by type. */
export function AccountList({ rows, month }: { rows: AccountRow[]; month: string }) {
  return (
    <>
      {TIERS.map((tier) => {
        const group = rows.filter((r) => r.account.tier === tier);
        if (group.length === 0) return null;
        return (
          <section key={tier} className="space-y-3">
            <h3 className="flex items-baseline gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {TIER_LABEL[tier]} <span className="tabular-nums text-slate-400">{group.length}</span>
            </h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {group.map((r) => (
                <li key={r.account.id} className="min-w-0">
                  <AccountCard row={r} month={month} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
