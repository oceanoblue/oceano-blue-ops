import { crmActor, crmDb, crmError, CrmError, readJson, sameOrigin } from "@/lib/crm/server";
import { inquiryActionSchema } from "@/lib/crm/inquiry-types";
import { inquiryRead, inquiryDraft, inquiryProjects } from "@/lib/crm/inquiry-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: Request) {
  try {
    const actor = await crmActor();
    const p = new URL(req.url).searchParams;
    if (p.get("projects_only") === "1") return Response.json({ projects: await inquiryProjects(p.get("q") ?? "") }, { headers });
    return Response.json(await inquiryRead(actor, { query: p.get("q") ?? "", status: (p.get("status") || "unanswered") as never, page: Number(p.get("page") ?? 0) }), { headers });
  } catch (e) { return crmError(e); }
}
export async function POST(req: Request) {
  try {
    const actor = await crmActor();
    sameOrigin(req);
    const b = inquiryActionSchema.parse(await readJson(req, 50000));
    if (process.env.VERCEL_ENV !== "production") throw new CrmError("Open production Ops to review or reply to inquiries.", 403);
    if (b.action === "draft") return Response.json({ draft: await inquiryDraft(actor, b.id) }, { headers });
    const { data, error } = await crmDb().rpc("crm_inquiry_action", { p_actor: actor, p_action: b.action, p_id: b.id, p_version: "version" in b ? b.version : null, p_data: b.data });
    if (error || !data) throw new CrmError("Inquiry changes could not be saved.", 503);
    if (data.error) throw new CrmError(data.error, data.error.includes("Record changed") ? 409 : 400);
    return Response.json(data, { headers });
  } catch (e) { return crmError(e); }
}
