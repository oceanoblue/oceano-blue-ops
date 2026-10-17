import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { crmDb } from "./server";
import { appBase } from "./acquisition-server";
import { mergeText, type FileContext } from "./acquisition-types";
export const escapeEmail = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function acquisitionEmail(
  job: { subject: string; body: string; context: FileContext },
  token?: string | null,
) {
  const subject = mergeText(job.subject, job.context)
    .replace(/[\r\n]/g, " ")
    .slice(0, 200);
  const body = escapeEmail(mergeText(job.body, job.context)).replace(
    /\n/g,
    "<br>",
  );
  const link = token ? `${appBase()}/smart-files/${token}` : null;
  if (
    link &&
    (!/^[a-f0-9]{64}$/.test(token!) || new URL(link).protocol !== "https:")
  )
    throw new Error("Invalid client file link.");
  return {
    subject,
    html: `<!doctype html><html><body style="margin:0;background:#f4f6f8;color:#1d2935;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;padding:32px 20px"><p style="font-size:20px;font-weight:700">Oceano Blue Media</p><div style="background:#fff;padding:28px;border-radius:16px;font-size:15px;line-height:1.65">${body}${link ? `<p style="margin:24px 0 0"><a href="${escapeEmail(link)}" style="display:inline-block;background:#072849;color:white;padding:12px 20px;border-radius:8px;text-decoration:none">Open your project file</a></p>` : ""}</div><p style="font-size:12px;color:#50677c">Oceano Blue Media · Reply to this email to reach our office.</p></div></body></html>`,
  };
}
export async function runAcquisition() {
  // Preview deployments share the CRM database; only the production worker may
  // send. Local workers require an explicit test harness, never a real API key.
  if (process.env.VERCEL_ENV !== "production")
    return { processed: 0, reason: "production_only" };
  const db = crmDb();
  const claimed = await db.rpc("crm_claim_acquisition", { p_limit: 5 });
  if (claimed.error) throw new Error("Unable to claim acquisition jobs.");
  const results = [];
  for (const job of claimed.data ?? []) {
    const prepared = await db.rpc("crm_prepare_acquisition", {
      p_id: job.id,
      p_lease: job.lease_token,
      p_configured: isEmailConfigured(),
    });
    if (prepared.error) throw new Error("Unable to prepare acquisition email.");
    if (prepared.data?.skip) {
      results.push({ id: job.id, status: "skipped" });
      continue;
    }
    let status = "needs_review",
      provider: string | null = null;
    try {
      const content = acquisitionEmail(
        prepared.data.job,
        prepared.data.file_token,
      );
      const sent = await sendEmail({
        to: job.recipient,
        ...content,
        idempotencyKey: `crm-acquisition/${job.id}`,
      });
      if (sent.status === "sent" && sent.id) {
        status = "accepted";
        provider = sent.id;
      } else if (sent.status === "not_configured") status = "blocked";
    } catch {
      /* A timeout may follow provider acceptance. Never replay it automatically. */
    }
    const saved = await db.rpc("crm_finish_acquisition", {
      p_id: job.id,
      p_lease: job.lease_token,
      p_status: status,
      p_provider: provider,
    });
    if (saved.error || saved.data !== true)
      throw new Error("Unable to confirm acquisition email outcome.");
    results.push({ id: job.id, status });
  }
  return { processed: results.length, results };
}
