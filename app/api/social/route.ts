import { CrmError, crmActor, crmError, readJson, sameOrigin } from "@/lib/crm/server";
import { actionSchema } from "@/lib/social/schema";
import { runAction } from "@/lib/social/server";

export const dynamic = "force-dynamic";

/** Office: every Social Studio change (clients, sub-accounts, planning, pieces, media, agreements). */
export async function POST(req: Request) {
  try {
    const actor = await crmActor();
    sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production")
      throw new CrmError("Changes are saved from the live system only.", 403);
    // Large enough for a full agreement text; every field is still length-checked.
    const action = actionSchema.parse(await readJson(req, 400000));
    return Response.json(
      { ok: true, ...(await runAction(actor, action)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return crmError(e);
  }
}
