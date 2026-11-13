import { z } from "zod";
import { CrmError, crmActor, crmError, readJson, sameOrigin } from "@/lib/crm/server";
import { listIntakes, setIntakeStatus } from "@/lib/social-onboarding/server";

export const dynamic = "force-dynamic";

/** Office: list social media onboarding intakes with their files. */
export async function GET() {
  try {
    await crmActor();
    return Response.json(
      { intakes: await listIntakes() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return crmError(e);
  }
}

/** Office: mark an intake reviewed, or reopen it. */
export async function POST(req: Request) {
  try {
    const actor = await crmActor();
    sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production")
      throw new CrmError("Changes are saved from the live system only.", 403);
    const body = z
      .object({ id: z.string().uuid(), status: z.enum(["new", "reviewed"]) })
      .parse(await readJson(req, 2000));
    await setIntakeStatus(actor, body.id, body.status);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
