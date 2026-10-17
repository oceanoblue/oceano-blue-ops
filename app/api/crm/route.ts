import { z } from "zod";
import { actions } from "@/lib/crm/types";
import {
  crmActor,
  crmDb,
  crmRead,
  readJson,
  sameOrigin,
  crmError,
  CrmError,
} from "@/lib/crm/server";
export async function GET(req: Request) {
  try {
    await crmActor();
    const params = new URL(req.url).searchParams;
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(params.get("page") || 0);
    const filters = z
      .object({
        query: z.string().max(120),
        tag: z.string().max(60),
        stage: z.string().uuid().optional(),
        owner: z.string().uuid().optional(),
      })
      .parse({
        query: params.get("q") || "",
        tag: params.get("tag") || "",
        stage: params.get("stage") || undefined,
        owner: params.get("owner") || undefined,
      });
    return Response.json(await crmRead(page, filters), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return crmError(e);
  }
}
export async function POST(req: Request) {
  try {
    const actor = await crmActor();
    sameOrigin(req);
    const body = actions.parse(await readJson(req, 2000000));
    const { data, error } = await crmDb().rpc("crm_action", {
      p_actor: actor,
      p_action: body.action,
      p_id: body.id,
      p_version: "version" in body ? body.version : null,
      p_data: body.data,
    });
    if (error)
      throw new CrmError(
        "Changes could not be saved. Check required fields and try again.",
        400,
      );
    if (data?.error)
      throw new CrmError(
        data.error,
        data.error === "Record changed. Reload before saving." ? 409 : 400,
      );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
