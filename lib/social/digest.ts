import { defaultReplyTo, sendEmail } from "@/lib/email/resend";
import { emailButton, emailShell, escapeHtml } from "@/lib/email/templates";
import { appOrigin, clientHref } from "./links";
import { ONBOARDING_LABEL, ONBOARDING_STEPS, monthLabel, shiftMonth, todayKey } from "./schema";
import { listPrograms, loadWorkspace, type Program } from "./server";
import { clientMonth, type MonthData } from "./summary";

/** One thing the office should know about, with the sub-accounts it concerns. */
export type DigestLine = { text: string; names: string[] };
export type DigestSection = { client: string; clientId: string; lines: DigestLine[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const unique = (names: string[]) => [...new Set(names)];

/**
 * What is worth an email about one client today, or null when nothing is.
 *
 * Active clients are checked every day: failed checks and late pieces in this
 * month and the next, media running out, access problems, overdue media
 * requests, and (from the 20th) a next month that is not fully planned.
 * Clients still being onboarded get one reminder a week, on Monday, with the
 * next onboarding step. Everyone else is left alone.
 */
export function digestSection(
  program: Program,
  current: { month: string; data: MonthData },
  next: { month: string; data: MonthData },
  today: string,
): DigestSection | null {
  const lines: DigestLine[] = [];
  const day = Number(today.slice(8, 10));
  const monday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;

  if (program.status === "onboarding") {
    if (!monday) return null;
    const left = ONBOARDING_STEPS.filter((s) => !program.onboarding?.[s]);
    if (left.length === 0) return null;
    lines.push({
      text: `Onboarding: ${ONBOARDING_STEPS.length - left.length} of ${ONBOARDING_STEPS.length} steps done. Next: ${ONBOARDING_LABEL[left[0]]}.`,
      names: [],
    });
    const blocked = current.data.accounts.filter((a) => a.is_active && a.access_status === "issue");
    if (blocked.length > 0) lines.push({ text: `${plural(blocked.length, "sub-account has", "sub-accounts have")} an access problem.`, names: blocked.map((a) => a.name) });
    return { client: program.name, clientId: program.id, lines };
  }
  if (program.status !== "active") return null;

  const now = clientMonth(program, current.data, today);
  const later = clientMonth(program, next.data, today);
  const names = new Map(current.data.accounts.map((a) => [a.id, a.name]));

  for (const [view, month] of [
    [now, current.month],
    [later, next.month],
  ] as const) {
    const failing = view.rows.filter((r) => r.errors > 0);
    if (view.summary.errors > 0)
      lines.push({ text: `${plural(view.summary.errors, "piece fails", "pieces fail")} a check in ${monthLabel(month)}.`, names: failing.map((r) => r.account.name) });
    if (view.summary.held > 0)
      lines.push({ text: `${plural(view.summary.held, "approved piece is", "approved pieces are")} held back from scheduling in ${monthLabel(month)} until fixed.`, names: [] });
  }
  if (now.summary.late > 0)
    lines.push({
      text: `${plural(now.summary.late, "piece is", "pieces are")} past the planned date and not scheduled.`,
      names: now.rows.filter((r) => r.late > 0).map((r) => r.account.name),
    });

  const out = now.rows.filter((r) => r.health === "out");
  const low = now.rows.filter((r) => r.health === "low");
  if (out.length > 0) lines.push({ text: `${plural(out.length, "sub-account is", "sub-accounts are")} out of recent media.`, names: out.map((r) => r.account.name) });
  if (low.length > 0) lines.push({ text: `${plural(low.length, "sub-account is", "sub-accounts are")} running low on media.`, names: low.map((r) => r.account.name) });

  const access = now.rows.filter((r) => r.account.access_status !== "connected");
  if (access.length > 0) lines.push({ text: `${plural(access.length, "sub-account does", "sub-accounts do")} not have confirmed access.`, names: access.map((r) => r.account.name) });

  const overdue = current.data.requests.filter((r) => r.due_on && r.due_on < today);
  if (overdue.length > 0)
    lines.push({
      text: `${plural(overdue.length, "media request is", "media requests are")} past the date we asked for.`,
      names: unique(overdue.map((r) => names.get(r.account_id) ?? "Sub-account")),
    });

  if (day >= 20 && later.summary.owed > 0 && later.summary.planned < later.summary.owed)
    lines.push({ text: `${monthLabel(next.month)} is not fully planned: ${later.summary.planned} of ${later.summary.owed} pieces are on the plan.`, names: [] });

  return lines.length > 0 ? { client: program.name, clientId: program.id, lines } : null;
}

const NAMES_SHOWN = 6;

/** The daily email to the office. */
export function digestEmail(sections: DigestSection[], today: string): { subject: string; html: string } {
  const count = sections.reduce((n, s) => n + s.lines.length, 0);
  const subject =
    sections.length === 1
      ? `Social media: ${plural(count, "item", "items")} to look at for ${sections[0].client}`
      : `Social media: ${plural(count, "item", "items")} to look at across ${sections.length} clients`;
  const body = sections
    .map((s) => {
      const items = s.lines
        .map((l) => {
          const shown = unique(l.names).slice(0, NAMES_SHOWN);
          const more = unique(l.names).length - shown.length;
          const detail = shown.length ? `<br/><span style="color:#708698;font-size:13px;">${escapeHtml(shown.join(", "))}${more > 0 ? ` and ${more} more` : ""}</span>` : "";
          return `<li style="margin:0 0 10px;">${escapeHtml(l.text)}${detail}</li>`;
        })
        .join("");
      return `<h2 style="font-size:17px;margin:22px 0 10px;color:#0c1620;">${escapeHtml(s.client)}</h2>
    <ul style="padding-left:18px;margin:0 0 14px;font-size:15px;line-height:1.5;">${items}</ul>
    <p style="margin:0 0 6px;">${emailButton(`${appOrigin()}${clientHref("dashboard", s.clientId)}`, `Open ${s.client}`)}</p>`;
    })
    .join("");
  const html = emailShell(
    `<h1 style="font-size:20px;margin:0 0 4px;color:#0c1620;">Social media, ${escapeHtml(today)}</h1>
    <p style="margin:0;color:#708698;font-size:14px;">Only what needs someone today. Nothing is sent when everything is on track.</p>${body}`,
    subject,
  );
  return { subject, html };
}

/** Tell the office a client signed, so we can countersign. */
export function agreementSignedEmail(p: { client: string; title: string; signer: string; url: string }): { subject: string; html: string } {
  const subject = `${p.client} signed: ${p.title}`;
  const html = emailShell(
    `<h1 style="font-size:20px;margin:0 0 10px;color:#0c1620;">${escapeHtml(p.client)} signed the agreement</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">${escapeHtml(p.signer)} signed &ldquo;${escapeHtml(p.title)}&rdquo;. It needs your countersignature to be complete.</p>
    ${emailButton(p.url, "Review and countersign")}`,
    subject,
  );
  return { subject, html };
}

/**
 * Build and send today's digest. Runs from a daily schedule. Sending the same
 * day twice is harmless: the email provider drops the repeat.
 */
export async function runSocialDigest(now: Date = new Date()) {
  // Preview deployments can share production data; they must never send email.
  if (process.env.VERCEL_ENV !== "production") return { skipped: true };
  const today = todayKey(now);
  const month = today.slice(0, 7);
  const nextMonth = shiftMonth(month, 1);
  const programs = (await listPrograms()).filter((p) => p.status === "active" || p.status === "onboarding");
  const sections: DigestSection[] = [];
  for (const program of programs) {
    const [current, next] = await Promise.all([loadWorkspace(program.id, month), loadWorkspace(program.id, nextMonth)]);
    const section = digestSection(program, { month, data: current }, { month: nextMonth, data: next }, today);
    if (section) sections.push(section);
  }
  if (sections.length === 0) return { sent: false, clients: 0 };
  const result = await sendEmail({
    to: process.env.SOCIAL_ALERT_EMAIL || defaultReplyTo(),
    ...digestEmail(sections, today),
    idempotencyKey: `social-digest/${today}`,
  });
  return { sent: result.status === "sent", status: result.status, clients: sections.length };
}
