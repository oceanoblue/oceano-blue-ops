import { z } from "zod";
import {
  crmActor,
  crmDb,
  crmError,
  CrmError,
  readJson,
  sameOrigin,
} from "@/lib/crm/server";
import { acquisitionActionSchema } from "@/lib/crm/acquisition-types";
import {
  acquisitionRead,
  acquisitionProjects,
} from "@/lib/crm/acquisition-server";
export async function GET(req: Request) {
  try {
    await crmActor();
    const p = new URL(req.url).searchParams;
    const q = z
      .string()
      .max(120)
      .parse(p.get("q") ?? "");
    const client = z
      .string()
      .uuid()
      .optional()
      .parse(p.get("contact") || undefined);
    if (p.get("projects_only") === "1") {
      const result = await acquisitionProjects(q, client);
      if (result.error)
        throw new CrmError("Project search is unavailable.", 503);
      return Response.json(
        { projects: result.data ?? [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return Response.json(await acquisitionRead(q, client), {
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
    const b = acquisitionActionSchema.parse(await readJson(req, 150000));
    if (process.env.VERCEL_ENV !== "production")
      throw new CrmError(
        "Open production Ops to save acquisition changes.",
        403,
      );
    const { data, error } = await crmDb().rpc("crm_acquisition_action", {
      p_actor: actor,
      p_action: b.action,
      p_id: b.id,
      p_version: "version" in b ? b.version : null,
      p_data: b.data,
    });
    if (error)
      throw new CrmError("Changes could not be saved. Please retry.", 503);
    if (data?.error)
      throw new CrmError(
        data.error,
        data.error.includes("Record changed") ? 409 : 400,
      );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
