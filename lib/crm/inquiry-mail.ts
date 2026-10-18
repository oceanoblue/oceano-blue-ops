import { crmDb } from "./server";
import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import { escapeEmail } from "./acquisition-mail";
import { inquiryOfficeConfig } from "./inquiry-server";
export async function runInquiryReminders() {
  if (process.env.VERCEL_ENV !== "production") return { processed: 0, reason: "production_only" };
  const office = inquiryOfficeConfig();
  if (!office.enabled || !office.recipient || !isEmailConfigured()) return { processed: 0, reason: "office_notifications_disabled" };
  const db = crmDb();
  const claimed = await db.rpc("crm_claim_inquiry_notifications", { p_recipient: office.recipient, p_limit: 5 });
  if (claimed.error) throw new Error("Unable to claim inquiry reminders.");
  let processed = 0;
  for (const job of claimed.data ?? []) {
    const prepared = await db.rpc("crm_prepare_inquiry_notification", { p_id: job.id, p_lease: job.lease_token, p_recipient: office.recipient });
    if (prepared.error) throw new Error("Unable to prepare inquiry reminder.");
    if (prepared.data !== true) continue;
    let status = "needs_review", provider: string | null = null;
    // Payload was frozen by the database, and recipients cannot come from a
    // contact or browser request. Escape even office-facing untrusted titles.
    try {
      const sent = await sendEmail({ to: job.recipient, subject: job.subject, html: `<p style="white-space:pre-wrap">${escapeEmail(job.body)}</p><p><a href="https://app.oceanoblue.net/dashboard/crm/inquiries">Review the Inquiry inbox</a></p>`, idempotencyKey: `crm-inquiry-office/${job.id}` });
      if (sent.status === "sent" && sent.id) { status = "accepted"; provider = sent.id; }
      else if (sent.status === "not_configured") status = "blocked";
    } catch {
      // Provider acceptance may have preceded a timeout. Quarantine immediately.
    }
    const saved = await db.rpc("crm_finish_inquiry_notification", { p_id: job.id, p_lease: job.lease_token, p_status: status, p_provider: provider });
    if (saved.error || saved.data !== true) throw new Error("Unable to confirm inquiry reminder outcome.");
    processed++;
  }
  return { processed };
}
