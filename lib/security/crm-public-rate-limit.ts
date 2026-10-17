import { createHash } from "node:crypto";
import { crmDb } from "@/lib/crm/server";
import { clientIp, windowBucket } from "./rate-limit";
/** Durable limits for CRM public reads/commands. An unavailable or malformed
 * limiter cannot authorize calendar access, booking writes or payment calls. */
export async function enforceCrmPublicRateLimit(req: Request, scope: string, limit: number, windowSeconds: number): Promise<Response | null> {
  const headers = { "Cache-Control": "no-store", "Retry-After": String(windowSeconds) };
  try {
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const { data, error } = await crmDb().rpc("bump_rate_limit", { p_key: `crm-public:${scope}:${ipHash}:${windowBucket(Date.now(), windowSeconds)}` });
    if (error || typeof data !== "number" || !Number.isSafeInteger(data) || data < 1)
      return Response.json({ error: "Please try again shortly." }, { status: 503, headers });
    if (data > limit) return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429, headers });
    return null;
  } catch {
    return Response.json({ error: "Please try again shortly." }, { status: 503, headers });
  }
}
