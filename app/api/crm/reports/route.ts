import { crmActor, crmDb, crmError, CrmError } from "@/lib/crm/server";
export async function GET() {
  try {
    await crmActor();
    const { data, error } = await crmDb().rpc("crm_report");
    if (error) throw new CrmError("Reports could not be loaded.", 503);
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return crmError(e);
  }
}
