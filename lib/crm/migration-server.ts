import { crmDb, CrmError } from "./server";
import { migrationFiltersSchema, type MigrationData, type MigrationFilters } from "./migration-types";
export async function migrationRead(actor: string, filters: Partial<MigrationFilters> = {}): Promise<MigrationData> {
  const f = migrationFiltersSchema.parse(filters);
  const { data, error } = await crmDb().rpc("crm_migration_page", {
    p_actor: actor, p_query: f.query, p_page: f.page, p_year: f.year, p_status: f.status, p_kind: f.kind,
  });
  if (error || !data || data.error) throw new CrmError("Migration review is temporarily unavailable.", 503);
  return { ...data, production: process.env.VERCEL_ENV === "production" } as MigrationData;
}
