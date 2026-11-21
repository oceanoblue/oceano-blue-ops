import { daysInMonth, shiftMonth, type Kind, type Quota } from "./schema";

export type MonthScope = Quota & { account_id: string; from_legacy_plan: boolean };
export const noQuota: Quota = { posts_per_month: 0, reels_per_month: 0, google_posts_per_month: 0 };

const quotaKey = { post: "posts_per_month", reel: "reels_per_month", google_post: "google_posts_per_month" } as const;

/** Count the promised slots, once per format and account. Extra posts cannot satisfy a reel. */
export function coveredSlots(quota: Quota, items: { kind: Kind; slot: number }[]): number {
  return new Set(items.filter((i) => i.slot > 0 && i.slot <= quota[quotaKey[i.kind]]).map((i) => `${i.kind}/${i.slot}`)).size;
}

/** Work delivered for a format counts up to the commitment, regardless of slot order. */
export function fulfilledQuota(quota: Quota, items: {kind: Kind}[]): number {
  const counts = { post: 0, reel: 0, google_post: 0 };
  for (const {kind} of items) counts[kind]++;
  return Math.min(counts.post,quota.posts_per_month) + Math.min(counts.reel,quota.reels_per_month)
    + Math.min(counts.google_post,quota.google_posts_per_month);
}

export function contractMonthState(month: string, term: { term_start: string | null; term_months: number }) {
  if (!term.term_start) return "in_term";
  const start = term.term_start.slice(0, 7);
  if (month < start) return "before";
  return term.term_months > 0 && month >= shiftMonth(start, term.term_months) ? "after" : "in_term";
}

/** Supply for a past month ends on that month's last day. Future views use today's stock. */
export function supplyAsOf(month: string, today: string) {
  return month < today.slice(0, 7) ? `${month}-${daysInMonth(month)}` : today;
}
