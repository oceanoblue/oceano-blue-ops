import { CrmError, crmActor, crmError, readJson, sameOrigin } from "@/lib/crm/server";
import { actionSchema } from "@/lib/social/schema";
import { runAction } from "@/lib/social/server";

export const dynamic = "force-dynamic";

/** Office: every Social Studio change (programs, accounts, planning, pieces, media). */
export async function POST(req: Request) {
  try {
    const actor = await crmActor();
    sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production")
      throw new CrmError("Changes are saved from the live system only.", 403);
    const action = actionSchema.parse(await readJson(req, 60000));
    return Response.json(
      { ok: true, ...(await runAction(actor, action)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return crmError(e);
  }
}
