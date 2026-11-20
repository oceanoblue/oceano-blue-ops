import { auditMonth, hasError, type Issue } from "./audit";
import {
  DONE,
  IN_PRODUCTION,
  ONBOARDING_STEPS,
  countByStatus,
  isLate,
  mediaHealth,
  quotaTotal,
  sumOf,
  type MediaHealth,
  type StatusCounts,
} from "./schema";
import type { Account, Item, MediaBatch, MediaRequest, Program } from "./server";

/** What the summary needs from a loaded month. */
export type MonthData = { accounts: Account[]; items: Item[]; media: MediaBatch[]; requests: MediaRequest[] };

/** One sub-account's month at a glance. */
export type AccountRow = {
  account: Account;
  counts: StatusCounts;
  /** Pieces on the plan this month. */
  planned: number;
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
  return data.accounts
    .filter((a) => a.is_active)
    .map((account) => {
      const items = data.items.filter((i) => i.account_id === account.id);
      const recent = data.media.filter((m) => m.account_id === account.id);
      const counts = countByStatus(items);
      return {
        account,
        counts,
        planned: items.length,
        owed: quotaTotal(account),
        done: sumOf(counts, DONE),
        late: items.filter((i) => isLate(i, today)).length,
        errors: items.filter((i) => hasError(audit[i.id])).length,
        health: mediaHealth(account, {
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
