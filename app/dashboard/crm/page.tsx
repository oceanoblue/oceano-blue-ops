import { notFound } from "next/navigation";
import { crmActor } from "@/lib/crm/server";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await crmActor();
  } catch {
    notFound();
  }
  return <CrmWorkspace />;
}
