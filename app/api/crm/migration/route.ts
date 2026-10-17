import { crmActor, crmDb, crmError, CrmError, readJson, sameOrigin } from "@/lib/crm/server";
import { migrationActionSchema, migrationFiltersSchema } from "@/lib/crm/migration-types";
import { migrationRead } from "@/lib/crm/migration-server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const actor = await crmActor();
    const p = new URL(req.url).searchParams;
    if (p.get("projects_only") === "1") {
      const f = migrationFiltersSchema.parse({ query: p.get("q") ?? "" });
      let query = crmDb().from("crm_opportunities").select("project_id,title").order("updated_at", { ascending: false }).limit(30);
      if (f.query) query = query.ilike("title", `%${f.query.replace(/[\\%_]/g, "\\$&")}%`);
      const { data, error } = await query;
      if (error) throw new CrmError("Project search is unavailable.", 503);
      return Response.json({ projects: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const filters = migrationFiltersSchema.parse({ query: p.get("q") ?? "", page: p.get("page") ?? 0, year: p.get("year") || null, status: p.get("status") ?? "unresolved", kind: p.get("kind") ?? "all" });
    return Response.json(await migrationRead(actor, filters), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return crmError(e); }
}
export async function POST(req: Request) {
  try {
    const actor = await crmActor();
    sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production") throw new CrmError("Open production Ops to save migration reviews.", 403);
    const b = migrationActionSchema.parse(await readJson(req, 2000000));
    const { data, error } = await crmDb().rpc("crm_migration_action", { p_actor: actor, p_action: b.action, p_id: b.id, p_version: "version" in b ? b.version : null, p_data: b.data });
    if (error) throw new CrmError("Migration review could not be saved.", 503);
    if (data?.error) throw new CrmError(data.error, data.error.includes("Record changed") ? 409 : 400);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return crmError(e); }
}
