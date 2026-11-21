import { coveredSlots, fulfilledQuota, noQuota, type MonthScope } from "./planning";
import { auditMonth, hasError, type Issue } from "./audit";
import {
  DONE,
  IN_PRODUCTION,
  ONBOARDING_STEPS,
  PLATFORMS,
  PLATFORM_LABEL,
  countByStatus,
  daysInMonth,
  isLate,
  mediaHealth,
  quotaTotal,
  shortDate,
  sumOf,
  type AccessStatus,
  type MediaHealth,
  type StatusCounts,
} from "./schema";
import type { Account, Item, MediaBatch, MediaRequest, Program } from "./server";

/** What the summary needs from a loaded month. */
export type MonthData = { month?: string; entitlements?: MonthScope[]; accounts: Account[]; items: Item[]; media: MediaBatch[]; requests: MediaRequest[] };

/** One sub-account's month at a glance. */
export type AccountRow = {
  account: Account;
  counts: StatusCounts;
  /** Pieces on the plan this month. */
  planned: number;
  missing: number;
  /** Pieces the account is owed each month. */
  owed: number;
  done: number;
  late: number;
  /** Pieces with a failed check. */
  errors: number;
  health: MediaHealth;
  requests: MediaRequest[];
};

/** One row per active sub-account, in the order the accounts were given. */
export function accountRows(data: MonthData, audit: Record<string, Issue[]>, today: string): AccountRow[] {
  const scope = data.entitlements && new Map(data.entitlements.map(s => [s.account_id, s]));
  return data.accounts
    .filter((a) => scope?.has(a.id) || (a.is_active && (!data.month || data.month >= today.slice(0,7))))
    .map((account) => {
      const items = data.items.filter((i) => i.account_id === account.id);
      const recent = data.media.filter((m) => m.account_id === account.id);
      const counts = countByStatus(items);
      const quota = scope ? scope.get(account.id) ?? noQuota : account;
      return {
        account,
        counts,
        planned: items.length,
        owed: quotaTotal(quota),
        missing: quotaTotal(quota) - coveredSlots(quota,items),
        done: fulfilledQuota(quota, items.filter(i => DONE.includes(i.status))),
        late: items.filter((i) => isLate(i, today)).length,
        errors: items.filter((i) => hasError(audit[i.id])).length,
        health: mediaHealth(quota, {
          photos: recent.reduce((n, m) => n + m.photos, 0),
          videos: recent.reduce((n, m) => n + m.videos, 0),
        }),
        requests: data.requests.filter((r) => r.account_id === account.id),
      };
    });
}

/** A whole client's month at a glance: the numbers on its card and dashboard. */
export type ClientSummary = {
  accounts: number;
  owed: number;
  planned: number;
  missing: number;
  done: number;
  inProduction: number;
  withClient: number;
  approved: number;
  late: number;
  /** Pieces with a failed check. */
  errors: number;
  /** Approved pieces held back from scheduling by a failed check. */
  held: number;
  outOfMedia: number;
  lowOnMedia: number;
  /** Sub-accounts whose access is not confirmed. */
  accessProblems: number;
  openRequests: number;
  onboardingDone: number;
  onboardingTotal: number;
  /** Share of the month's owed pieces that are scheduled or live, 0 to 100. */
  percentDone: number;
};

export function summarize(program: Pick<Program, "onboarding">, rows: AccountRow[], items: Item[], audit: Record<string, Issue[]>): ClientSummary {
  const totals = countByStatus(items);
  const owed = rows.reduce((n, r) => n + r.owed, 0);
  const done = rows.reduce((n, r) => n + r.done, 0);
  return {
    accounts: rows.length,
    owed,
    missing: rows.reduce((n, r) => n + r.missing, 0),
    planned: rows.reduce((n, r) => n + r.planned, 0),
    done,
    inProduction: sumOf(totals, IN_PRODUCTION),
    withClient: totals.client_review,
    approved: totals.approved,
    late: rows.reduce((n, r) => n + r.late, 0),
    errors: rows.reduce((n, r) => n + r.errors, 0),
    held: items.filter((i) => i.status === "approved" && hasError(audit[i.id])).length,
    outOfMedia: rows.filter((r) => r.health === "out").length,
    lowOnMedia: rows.filter((r) => r.health === "low").length,
    accessProblems: rows.filter((r) => r.account.access_status !== "connected").length,
    openRequests: rows.reduce((n, r) => n + r.requests.length, 0),
    onboardingDone: ONBOARDING_STEPS.filter((s) => program.onboarding?.[s]).length,
    onboardingTotal: ONBOARDING_STEPS.length,
    percentDone: owed > 0 ? Math.min(100, Math.round((done / owed) * 100)) : 0,
  };
}

/** Rows, check results and summary for one client and month, in one call. */
export function clientMonth(program: Pick<Program, "onboarding" | "avoid_terms">, data: MonthData, today: string) {
  const audit = auditMonth(data.items, data.accounts, program.avoid_terms, today);
  const rows = accountRows(data, audit, today);
  return { audit, rows, summary: summarize(program, rows, data.items, audit) };
}

// ---------------------------------------------------------------------------
// Numbers behind the dashboard's charts
// ---------------------------------------------------------------------------

/** One day of the month on the "by planned date" chart. */
export type RhythmDay = {
  /** Day of the month, 1 to 31. */
  day: number;
  /** "Nov 12". */
  label: string;
  /** Pieces dated this day that are scheduled or live. */
  done: number;
  /** Pieces dated this day that are still being worked on. */
  open: number;
};

/** Every day of `month`, with how many pieces are dated that day. Pieces with no date, or a date in another month, are left out. */
export function rhythm(items: Pick<Item, "status" | "scheduled_for">[], month: string): RhythmDay[] {
  const days: RhythmDay[] = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const day = i + 1;
    return { day, label: shortDate(`${month}-${String(day).padStart(2, "0")}`), done: 0, open: 0 };
  });
  for (const item of items) {
    if (!item.scheduled_for?.startsWith(`${month}-`)) continue;
    const slot = days[Number(item.scheduled_for.slice(8, 10)) - 1];
    if (!slot) continue;
    if (DONE.includes(item.status)) slot.done += 1;
    else slot.open += 1;
  }
  return days;
}

/** How many sub-accounts post on each platform, most used first. Platforms nobody uses are left out. */
export function platformCounts(rows: AccountRow[]): { label: string; value: number }[] {
  return PLATFORMS.map((p) => ({ label: PLATFORM_LABEL[p], value: rows.filter((r) => r.account.platforms.includes(p)).length }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** How many sub-accounts are in each state of media supply and of access. */
export function healthCounts(rows: AccountRow[]): { media: Record<MediaHealth, number>; access: Record<AccessStatus, number> } {
  const media: Record<MediaHealth, number> = { good: 0, low: 0, out: 0 };
  const access: Record<AccessStatus, number> = { connected: 0, pending: 0, issue: 0 };
  for (const r of rows) {
    media[r.health] += 1;
    access[r.account.access_status] += 1;
  }
  return { media, access };
}
