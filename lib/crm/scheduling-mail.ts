import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import { crmDb } from "./server";
import type { Appointment } from "./scheduling-types";
import { syncSessionCalendar } from "./scheduling-calendar";
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function sessionEmail(a: Appointment, kind: string, base: string, office = false) {
    const when = new Intl.DateTimeFormat("en-US", { timeZone: a.timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(a.starts_at));
    const subject = `${kind === "cancelled" ? "Session cancelled" : kind === "rescheduled" ? "Session rescheduled" : kind === "reminder" ? "Your session is tomorrow" : kind === "reminder_1h" ? "Session starts in one hour" : "Session confirmed"} · ${a.title}${office ? ` · ${a.full_name}` : ""}`.replace(/[\r\n]/g, " ").slice(0, 200);
    const url = office ? `${base}/dashboard/crm/scheduling` : `${base}/meet/manage/${a.manage_token}`;
    const preparation=kind!=="cancelled"&&a.confirmation_instructions?.trim()?`<div style="margin-top:20px;padding:16px;background:#f5f7fa;border-radius:10px"><p style="margin:0 0 8px;font-weight:700">Before your session</p><p style="margin:0">${esc(a.confirmation_instructions).replace(/\r\n|\r|\n/g,"<br>")}</p></div>`:"";
    if (!/^https:\/\//.test(base) || !office && !/^[a-f0-9]{64}$/.test(a.manage_token ?? ""))
        throw new Error("Invalid session link.");
    return { subject, html: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f7fa;color:#183449;padding:24px"><div style="max-width:560px;margin:auto;background:white;border-radius:16px;padding:32px"><p style="font-size:20px;font-weight:700">Oceano Blue Media</p><h1 style="font-size:24px">${esc(subject.split(" · ")[0])}</h1><p>${office ? `Client: <strong>${esc(a.full_name)}</strong><br>${esc(a.email)}${a.phone ? ` · ${esc(a.phone)}` : ""}` : `Hello ${esc(a.full_name)},`}</p><p><strong>${esc(a.title)}</strong><br>${esc(when)} (${esc(a.timezone)})</p>${a.location ? `<p>${esc(a.location)}</p>` : ""}<p><a href="${esc(url)}" style="display:inline-block;background:#082b48;color:white;padding:12px 20px;border-radius:8px;text-decoration:none">${office ? "Open the Ops agenda" : kind === "cancelled" ? "View session" : "Manage session and add to calendar"}</a></p>${preparation}<p>Reply to this email to reach our office.</p></div></body></html>` };
}
export async function runSessionNotifications() {
    if (process.env.VERCEL_ENV !== "production")
        return { processed: 0, reason: "production_only" };
    const db = crmDb(), { data: jobs, error } = await db.rpc("crm_claim_session_notifications", { p_limit: 3 });
    if (error)
        throw new Error("Unable to claim session notifications.");
    const results = [];
    for (const job of jobs ?? []) {
        const { data: a, error: read } = await db.from("crm_appointments").select("*").eq("id", job.appointment_id).maybeSingle();
        if (read)
            throw new Error("Unable to read session notification.");
        let status = "cancelled", provider_id: string | null = null, last_error: string | null = null;
        if (a && job.kind === "calendar" && a.version === job.appointment_version && a.source_system === "ops") {
            try {
                await syncSessionCalendar(a);
                status = "accepted";
            }
            catch (e) {
                status = "needs_review";
                last_error = e instanceof Error ? e.message : "Calendar sync needs review.";
            }
        }
        else if (a && job.kind !== "calendar" && (job.audience === "office" || a.email_consent) && a.version === job.appointment_version && (job.kind === "cancelled" ? a.status === "cancelled" : a.status === "confirmed") && (job.kind === "cancelled" || Date.parse(a.starts_at) > Date.now())) {
            // An uncertain attempt is retained for office review; never blindly replay
            // client mail following a provider timeout or outside its dedupe window.
            status = "needs_review";
            try {
                if (!isEmailConfigured())
                    throw new Error("Email is not configured.");
                let recipient = a.email;
                if (job.audience === "office") {
                    const { data: host, error: hostError } = await db.from("team_members").select("email,is_active").eq("id", a.owner_id).maybeSingle();
                    if (hostError || !host?.is_active || !host.email)
                        throw new Error("Office host email needs review.");
                    recipient = host.email;
                }
                const content = sessionEmail(a, job.kind, process.env.NEXT_PUBLIC_APP_URL || "https://app.oceanoblue.net", job.audience === "office");
                const sent = await sendEmail({ to: recipient, ...content, idempotencyKey: `crm-session/${job.id}` });
                if (sent.status === "sent" && sent.id) {
                    status = "accepted";
                    provider_id = sent.id;
                }
                else
                    last_error = "Email acceptance could not be verified. Check the provider before retrying.";
            }
            catch {
                last_error = "Email acceptance could not be verified. Check the provider before retrying.";
            }
        }
        const saved = await db.from("crm_session_notifications").update({ status, provider_id, last_error, locked_at: null }).eq("id", job.id).eq("lease_token", job.lease_token).eq("status", "sending").select("id").maybeSingle();
        if (saved.error || !saved.data)
            throw new Error("Unable to save session email outcome.");
        results.push({ id: job.id, status });
    }
    return { processed: results.length, results };
}
