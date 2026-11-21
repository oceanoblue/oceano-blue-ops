import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { CrmError, crmError, readJson } from "@/lib/crm/server";
import { parseMonth } from "@/lib/social/schema";
import { discoverDeliveries, claimDelivery, recordReceipt, bridgeAction } from "@/lib/social/delivery";

export const dynamic = "force-dynamic";

/** GET lists candidate identifiers. Only an explicit live POST claim returns a dispatch payload. */
function authorize(request: Request) {
  const secret = process.env.POS_AUTOMATION_SECRET;
  if (!secret) throw new CrmError("The automation bridge is not configured.", 503);
  // Constant-time comparison (hash both sides so lengths always match).
  const a = createHash("sha256").update(request.headers.get("x-pos-automation-secret") ?? "").digest();
  const b = createHash("sha256").update(secret).digest();
  if (!timingSafeEqual(a, b)) throw new CrmError("Unauthorized.", 401);
}

const uuid = z.string().uuid();
export async function GET(request: Request) {
  try {
    authorize(request);
    const url = new URL(request.url);
    // "client" is the current name; "program" is still accepted for scenarios built earlier.
    const program = uuid.safeParse(url.searchParams.get("client") ?? url.searchParams.get("program"));
    if (!program.success) throw new CrmError("Pass the client id.", 400);
    const result = await discoverDeliveries(program.data, parseMonth(url.searchParams.get("month")));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}

export async function POST(request: Request) {
  try {
    authorize(request);
    const raw = await readJson(request, 4000);
    if (raw && typeof raw === "object" && !("action" in raw) && "id" in raw && "event" in raw)
      throw new CrmError("Upgrade this scenario to destination claims and provider receipts (protocol 2).", 409);
    const body = bridgeAction.parse(raw);
    const result = body.action === "claim" ? await claimDelivery(body) : await recordReceipt(body);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
