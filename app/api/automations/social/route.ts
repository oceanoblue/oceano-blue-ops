import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { CrmError, crmError, readJson } from "@/lib/crm/server";
import { parseMonth } from "@/lib/social/schema";
import { approvedPieces, recordPublishing } from "@/lib/social/server";

export const dynamic = "force-dynamic";

/**
 * Social Studio <-> Make bridge. Server to server, authenticated with the
 * shared `x-pos-automation-secret` header (env POS_AUTOMATION_SECRET), the
 * same as the podcast bridge. Not a user session.
 *
 * GET  ?program=<id>&month=YYYY-MM  approved pieces ready to schedule, plus
 *      approved pieces held back by a failed check.
 * POST { id, event: "scheduled" | "published", published_url? }  record what
 *      the publishing tool did. Only ever moves a piece forward.
 */
function authorize(request: Request) {
  const secret = process.env.POS_AUTOMATION_SECRET;
  if (!secret) throw new CrmError("The automation bridge is not configured.", 503);
  // Constant-time comparison (hash both sides so lengths always match).
  const a = createHash("sha256").update(request.headers.get("x-pos-automation-secret") ?? "").digest();
  const b = createHash("sha256").update(secret).digest();
  if (!timingSafeEqual(a, b)) throw new CrmError("Unauthorized.", 401);
}

const uuid = z.string().uuid();
const Event = z.object({
  id: uuid,
  event: z.enum(["scheduled", "published"]),
  published_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Use a link that starts with https://")
    .default(""),
});

export async function GET(request: Request) {
  try {
    authorize(request);
    const url = new URL(request.url);
    const program = uuid.safeParse(url.searchParams.get("program"));
    if (!program.success) throw new CrmError("Pass the program id.", 400);
    const result = await approvedPieces(program.data, parseMonth(url.searchParams.get("month")));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}

export async function POST(request: Request) {
  try {
    authorize(request);
    if (process.env.VERCEL_ENV !== "production") throw new CrmError("Changes are saved from the live system only.", 403);
    const body = Event.parse(await readJson(request, 4000));
    const result = await recordPublishing(body.id, body.event, body.published_url);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
