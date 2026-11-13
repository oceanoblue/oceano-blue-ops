import { createHash } from "node:crypto";
import { CrmError, crmDb, crmError, readJson } from "@/lib/crm/server";
import { clientIp, windowBucket } from "@/lib/security/rate-limit";
import { fileRequestSchema } from "@/lib/social-onboarding/schema";
import { confirmFileUpload, signFileUpload } from "@/lib/social-onboarding/server";

export const dynamic = "force-dynamic";

/**
 * Public: issue a one-time signed upload URL for one file of an intake the
 * browser already created ("sign"), then record that it arrived ("done").
 * The storage path is fixed server-side; the browser can't choose it.
 */
export async function POST(req: Request) {
  try {
    if (process.env.VERCEL_ENV !== "production")
      throw new CrmError("Upload files through the live page.", 403);
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new CrmError("Reload the page and try again.", 403);
    const parsed = fileRequestSchema.safeParse(await readJson(req, 4000));
    if (!parsed.success) throw new CrmError("That file can't be uploaded here.");
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const limited = await crmDb().rpc("bump_rate_limit", {
      p_key: `social-onboarding-files:${ipHash}:${windowBucket(Date.now(), 3600)}`,
    });
    if (limited.error) throw new CrmError("Please try again shortly.", 503);
    if (typeof limited.data !== "number" || limited.data > 300)
      return Response.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    const headers = { "Cache-Control": "no-store" };
    if (parsed.data.action === "sign")
      return Response.json(
        { ok: true, ...(await signFileUpload(parsed.data)) },
        { headers },
      );
    await confirmFileUpload(parsed.data);
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    return crmError(e);
  }
}
