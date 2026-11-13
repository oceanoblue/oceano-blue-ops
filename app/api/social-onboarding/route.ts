import { createHash } from "node:crypto";
import { CrmError, crmDb, crmError, readJson } from "@/lib/crm/server";
import { clientIp, windowBucket } from "@/lib/security/rate-limit";
import { firstIssue, submitSchema } from "@/lib/social-onboarding/schema";
import { submitIntake } from "@/lib/social-onboarding/server";

export const dynamic = "force-dynamic";

/** Public: a new social media client sends their onboarding details. */
export async function POST(req: Request) {
  try {
    if (process.env.VERCEL_ENV !== "production")
      throw new CrmError("Send your details through the live page.", 403);
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new CrmError("Reload the page and try again.", 403);
    const parsed = submitSchema.safeParse(await readJson(req, 60000));
    if (!parsed.success) throw new CrmError(firstIssue(parsed.error));
    // Bots fill the hidden field. Tell them it worked and save nothing.
    if (parsed.data.company_site) return Response.json({ ok: true });
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const limited = await crmDb().rpc("bump_rate_limit", {
      p_key: `social-onboarding:${ipHash}:${windowBucket(Date.now(), 3600)}`,
    });
    if (limited.error) throw new CrmError("Please try again shortly.", 503);
    if (typeof limited.data !== "number" || limited.data > 8)
      return Response.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    await submitIntake(parsed.data);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
