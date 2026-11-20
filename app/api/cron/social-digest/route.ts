import { captureError } from "@/lib/observability/report";
import { runSocialDigest } from "@/lib/social/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Daily: email the office what needs attention across social media clients. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await runSocialDigest(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    captureError("social.digest", error);
    return Response.json({ error: "social_digest_failed" }, { status: 500 });
  }
}
