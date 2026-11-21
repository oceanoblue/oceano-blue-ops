import { createHash } from "node:crypto";
import { CrmError, crmDb, crmError, readJson } from "@/lib/crm/server";
import { defaultReplyTo, sendEmail } from "@/lib/email/resend";
import { clientIp, windowBucket } from "@/lib/security/rate-limit";
import { clientFeedbackEmail } from "@/lib/social/digest";
import { appOrigin, clientHref } from "@/lib/social/links";
import { clientActionSchema } from "@/lib/social/schema";
import { clientAction } from "@/lib/social/server";

export const dynamic = "force-dynamic";

/**
 * Public: what a client does from their private page. They can approve a
 * piece, ask for a change, or send the team a note. The secret in the link is
 * the only credential, so it is checked on every call, every piece and
 * sub-account is checked against the client the link belongs to, and
 * attempts are rate limited per address.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (process.env.VERCEL_ENV !== "production") throw new CrmError("Use the live page to send this.", 403);
    if (req.headers.get("origin") !== new URL(req.url).origin) throw new CrmError("Reload the page and try again.", 403);
    const { token } = await params;
    const parsed = clientActionSchema.safeParse(await readJson(req, 20000));
    if (!parsed.success) throw new CrmError(parsed.error.issues[0]?.message || "Check the form and try again.");
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const limited = await crmDb().rpc("bump_rate_limit", {
      p_key: `social-client:${ipHash}:${windowBucket(Date.now(), 3600)}`,
    });
    if (limited.error) throw new CrmError("Please try again shortly.", 503);
    // Generous enough to approve a full month piece by piece, tight enough to stop a script.
    if (typeof limited.data !== "number" || limited.data > 300)
      return Response.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": "3600" } });

    const result = await clientAction(token, parsed.data);

    // Change requests and notes go to the office straight away. What the client did is
    // already saved, so a failed email never fails the request.
    if (result.notify) {
      try {
        await sendEmail({
          to: process.env.SOCIAL_ALERT_EMAIL || defaultReplyTo(),
          ...clientFeedbackEmail({
            client: result.client,
            ...result.notify,
            url: `${appOrigin()}${clientHref(result.notify.kind === "changes" ? "checks" : "dashboard", result.program_id)}`,
          }),
        });
      } catch {
        // Nothing to do: the request shows on the client's dashboard either way.
      }
    }
    return Response.json({ ok: true, approved: result.approved }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
