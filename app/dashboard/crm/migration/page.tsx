import { notFound } from "next/navigation";
import { crmActor } from "@/lib/crm/server";
import { migrationRead } from "@/lib/crm/migration-server";
import { MigrationWorkspace } from "@/components/crm/MigrationWorkspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  let actor: string;
  try { actor = await crmActor(); } catch { notFound(); }
  const initial = await migrationRead(actor).catch(() => null);
  return <MigrationWorkspace initialData={initial} />;
}
