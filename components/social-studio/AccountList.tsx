import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { accountHref } from "@/lib/social/links";
import {
  ACCESS_LABEL,
  ACCESS_PILL,
  DONE,
  MEDIA_HEALTH_LABEL,
  MEDIA_HEALTH_PILL,
  PLATFORM_LABEL,
  STATUSES,
  STATUS_BAR,
  STATUS_LABEL,
  TIERS,
  TIER_LABEL,
  sumOf,
} from "@/lib/social/schema";
import type { AccountRow } from "@/lib/social/summary";

/** A client's sub-accounts, grouped by type, each with its month at a glance. */
export function AccountList({ rows, month }: { rows: AccountRow[]; month: string }) {
  return (
    <>
      {TIERS.map((tier) => {
        const group = rows.filter((r) => r.account.tier === tier);
        if (group.length === 0) return null;
        return (
          <section key={tier} className="card overflow-hidden">
            <header className="flex items-baseline justify-between gap-3 border-b border-ink-100 px-5 py-3">
              <h2 className="font-display text-lg font-semibold text-ocean-950">{TIER_LABEL[tier]} sub-accounts</h2>
              <span className="text-sm text-slate-500">{group.length}</span>
            </header>
            <ul className="divide-y divide-ink-100">
              {group.map((r) => (
                <li key={r.account.id}>
                  <Link href={accountHref(r.account.id, month)} className="grid items-center gap-3 px-5 py-3 hover:bg-ink-50/70 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_auto_auto]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-900">{r.account.name}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {r.account.platforms.map((p) => PLATFORM_LABEL[p]).join(" · ") || "No platforms set"}
                      </div>
                    </div>
                    <div>
                      <div
                        className="flex h-2 overflow-hidden rounded-full bg-ink-100"
                        role="img"
                        aria-label={STATUSES.filter((s) => r.counts[s] > 0).map((s) => `${r.counts[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(", ") || "Nothing planned"}
                      >
                        {STATUSES.map((s) =>
                          r.counts[s] > 0 ? <span key={s} className={STATUS_BAR[s]} style={{ width: `${(r.counts[s] / Math.max(r.owed, r.planned, 1)) * 100}%` }} /> : null,
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {sumOf(r.counts, DONE)} of {r.owed} scheduled or live
                        {r.planned < r.owed && ` · ${r.owed - r.planned} not planned`}
                        {r.late > 0 && <span className="font-semibold text-rose-700"> · {r.late} late</span>}
                        {r.errors > 0 && <span className="font-semibold text-rose-700"> · {r.errors} to fix</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 md:justify-end">
                      <span className={`pill ${MEDIA_HEALTH_PILL[r.health]}`}>{MEDIA_HEALTH_LABEL[r.health]}</span>
                      <span className={`pill ${ACCESS_PILL[r.account.access_status]}`}>{ACCESS_LABEL[r.account.access_status]}</span>
                    </div>
                    <ChevronRight className="hidden h-4 w-4 text-slate-300 md:block" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
