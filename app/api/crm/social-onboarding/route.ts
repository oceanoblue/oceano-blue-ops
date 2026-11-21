import { z } from "zod";
import { CrmError, crmActor, crmError, readJson, sameOrigin } from "@/lib/crm/server";
import { INTAKE_PAGE_SIZE, linkIntake, listIntakes, setIntakeStatus } from "@/lib/social-onboarding/server";

export const dynamic = "force-dynamic";

/** Office: list social media onboarding intakes with their files. */
export async function GET(req: Request) {
  try {
    await crmActor();
    const params = new URL(req.url).searchParams;
    const before = params.has("before") || params.has("id")
      ? z.object({ date: z.iso.datetime({ offset: true }), id: z.uuid() }).parse({ date: params.get("before"), id: params.get("id") })
      : undefined;
    const intakes = await listIntakes({ before });
    return Response.json(
      { intakes, hasMore: intakes.length === INTAKE_PAGE_SIZE },
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
    const body = z.union([
      z.object({ action: z.literal("link_program"), id: z.uuid(), program_id: z.uuid().nullable() }),
      z.object({ id: z.uuid(), status: z.enum(["new", "reviewed"]) }),
    ]).parse(await readJson(req, 2000));
    if ("action" in body) {
      const programId = await linkIntake(actor, body.id, body.program_id);
      return Response.json({ ok: true, program_id: programId }, { headers: { "Cache-Control": "no-store" } });
    }
    await setIntakeStatus(actor, body.id, body.status);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
