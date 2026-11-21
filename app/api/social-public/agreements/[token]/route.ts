import { createHash } from "node:crypto";
import { CrmError, crmDb, crmError, readJson } from "@/lib/crm/server";
import { defaultReplyTo, sendEmail } from "@/lib/email/resend";
import { captureError } from "@/lib/observability/report";
import { clientIp, windowBucket } from "@/lib/security/rate-limit";
import { agreementSignedEmail } from "@/lib/social/digest";
import { appOrigin, clientHref } from "@/lib/social/links";
import { signSchema } from "@/lib/social/schema";
import { signAgreement } from "@/lib/social/server";

export const dynamic = "force-dynamic";

/**
 * Public: a client signs the agreement behind their private link. The link's
 * secret is the only credential, so attempts are rate limited per address.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (process.env.VERCEL_ENV !== "production") throw new CrmError("Sign through the live page.", 403);
    if (req.headers.get("origin") !== new URL(req.url).origin) throw new CrmError("Reload the page and try again.", 403);
    const { token } = await params;
    const parsed = signSchema.safeParse(await readJson(req, 4000));
    if (!parsed.success) throw new CrmError(parsed.error.issues[0]?.message || "Check the form and try again.");
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const limited = await crmDb().rpc("bump_rate_limit", {
      p_key: `social-agreement:${ipHash}:${windowBucket(Date.now(), 3600)}`,
    });
    if (limited.error) throw new CrmError("Please try again shortly.", 503);
    if (typeof limited.data !== "number" || limited.data > 10)
      return Response.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers: { "Retry-After": "3600" } });

    const signed = await signAgreement(token, parsed.data, ipHash);

    // Tell the office. The signature is already saved, so a failed email never fails the request.
    try {
      const email = await sendEmail({
        idempotencyKey: `social-agreement/${createHash("sha256").update(token).digest("hex")}`,
        to: process.env.SOCIAL_ALERT_EMAIL || defaultReplyTo(),
        ...agreementSignedEmail({
          client: signed.client,
          title: signed.title,
          signer: parsed.data.signer_name,
          url: `${appOrigin()}${clientHref("agreement", signed.program_id)}`,
        }),
      });
      if (email.status !== "sent") captureError("social.signature_notification", new Error(email.status), { program_id: signed.program_id });
    } catch {
      captureError("social.signature_notification", new Error("Delivery unavailable"), { program_id: signed.program_id });
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
