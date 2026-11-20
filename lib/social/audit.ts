import { DONE, IN_PRODUCTION, KIND_LABEL, type Kind, type Platform, type Status } from "./schema";

/**
 * Automatic checks on a month's content. Nothing here blocks anyone: the
 * office sees what needs fixing, and the Make bridge holds back any approved
 * piece that still has an error.
 */

export type Severity = "error" | "warning";
export type Issue = { code: string; severity: Severity; message: string };

export type AuditItem = {
  id: string;
  account_id: string;
  month: string;
  kind: Kind;
  title: string;
  caption: string;
  status: Status;
  scheduled_for: string | null;
  assignee: string | null;
  design_url: string;
};
export type AuditAccount = { id: string; platforms: Platform[]; avoid_terms: string[] };

/** Longest caption each platform accepts. Facebook's limit is too high to matter. */
export const CAPTION_LIMIT: Partial<Record<Platform, number>> = {
  x: 280,
  google: 1500,
  instagram: 2200,
  linkedin: 3000,
  tiktok: 2200,
};
const PLATFORM_NAME: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  google: "Google",
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
};
export const MAX_HASHTAGS = 30;
/** Stages where a piece is meant to be complete. */
const READY: readonly Status[] = ["internal_review", "client_review", "approved", "scheduled", "published"];

const normalize = (caption: string) => caption.toLowerCase().replace(/\s+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The terms from `avoid` that appear in `caption` as whole words or phrases. */
export function termsUsed(caption: string, avoid: string[]): string[] {
  return avoid.filter((term) => {
    const t = term.trim();
    return t && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(t)}($|[^\\p{L}\\p{N}])`, "iu").test(caption);
  });
}

/** The platforms a piece is published to: a Google post goes to Google only. */
function platformsFor(kind: Kind, account: AuditAccount): Platform[] {
  return kind === "google_post" ? ["google"] : account.platforms.filter((p) => p !== "google");
}

export function auditItem(
  item: AuditItem,
  account: AuditAccount,
  context: { today: string; programAvoid: string[]; repeated: boolean },
): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, severity: Severity, message: string) => issues.push({ code, severity, message });
  const ready = READY.includes(item.status);
  const done = DONE.includes(item.status);
  const caption = item.caption.trim();

  if (ready && !caption) add("no_caption", "error", "No caption yet.");
  if (ready && !item.design_url) add("no_design", "warning", "No design link.");
  if ((item.status === "approved" || done) && !item.scheduled_for) add("no_date", "error", "No publish date.");
  if (item.scheduled_for && item.scheduled_for.slice(0, 7) !== item.month.slice(0, 7))
    add("wrong_month", "warning", "The publish date is outside this month.");
  if (item.scheduled_for && item.scheduled_for < context.today) {
    if (item.status === "scheduled") add("unconfirmed", "warning", "The publish date has passed. Mark it published or move the date.");
    else if (!done) add("late", "warning", "Past its date and not scheduled.");
  }
  if (IN_PRODUCTION.includes(item.status) && !item.assignee) add("unassigned", "warning", "In production with nobody assigned.");

  if (caption) {
    const platforms = platformsFor(item.kind, account);
    for (const p of platforms) {
      const limit = CAPTION_LIMIT[p];
      if (limit && caption.length > limit)
        // A caption can be shortened for one platform, so only Instagram and Google (which have no shorter variant) are errors.
        add(`too_long_${p}`, p === "instagram" || p === "google" ? "error" : "warning",
          `Too long for ${PLATFORM_NAME[p]}: ${caption.length.toLocaleString("en-US")} of ${limit.toLocaleString("en-US")} characters.`);
    }
    const hashtags = caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
    if (platforms.includes("instagram") && hashtags > MAX_HASHTAGS)
      add("too_many_hashtags", "error", `${hashtags} hashtags. Instagram allows ${MAX_HASHTAGS}.`);
    if (platforms.includes("instagram") && /https?:\/\/\S+/i.test(caption))
      add("link_in_caption", "warning", "Links in an Instagram caption are not clickable.");
    const used = termsUsed(caption, [...context.programAvoid, ...account.avoid_terms]);
    if (used.length) add("avoid_term", "error", `Uses ${used.length === 1 ? "a term" : "terms"} to avoid: ${used.join(", ")}.`);
    if (context.repeated) add("repeated", "error", "Same caption as another piece for this account this month.");
    const letters = caption.replace(/[^\p{L}]/gu, "");
    if (letters.length >= 20 && letters.replace(/[^\p{Lu}]/gu, "").length / letters.length > 0.7)
      add("all_caps", "warning", "Mostly capital letters.");
    if (/\[[^\]]{2,}\]/.test(caption)) add("placeholder", "error", "Still has a [placeholder] to fill in.");
  }
  return issues;
}

/** Every piece's issues for a month. Pieces with none are left out. */
export function auditMonth(
  items: AuditItem[],
  accounts: AuditAccount[],
  programAvoid: string[],
  today: string,
): Record<string, Issue[]> {
  const byAccount = new Map(accounts.map((a) => [a.id, a]));
  const seen = new Map<string, number>();
  for (const item of items) {
    const caption = normalize(item.caption);
    if (caption) seen.set(`${item.account_id}|${caption}`, (seen.get(`${item.account_id}|${caption}`) ?? 0) + 1);
  }
  const result: Record<string, Issue[]> = {};
  for (const item of items) {
    const account = byAccount.get(item.account_id);
    if (!account) continue;
    const caption = normalize(item.caption);
    const issues = auditItem(item, account, {
      today,
      programAvoid,
      repeated: !!caption && (seen.get(`${item.account_id}|${caption}`) ?? 0) > 1,
    });
    if (issues.length) result[item.id] = issues;
  }
  return result;
}

export const hasError = (issues: Issue[] | undefined) => !!issues?.some((i) => i.severity === "error");
export function countIssues(audit: Record<string, Issue[]>): { errors: number; warnings: number; pieces: number } {
  let errors = 0;
  let warnings = 0;
  for (const issues of Object.values(audit))
    for (const issue of issues) issue.severity === "error" ? (errors += 1) : (warnings += 1);
  return { errors, warnings, pieces: Object.keys(audit).length };
}
/** "Post 3" style label used in lists of issues. */
export const pieceLabel = (item: { kind: Kind; slot: number }) => `${KIND_LABEL[item.kind]} ${item.slot}`;
