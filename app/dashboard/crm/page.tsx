import { notFound } from "next/navigation";
import { crmActor, crmRead } from "@/lib/crm/server";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await crmActor();
  } catch {
    notFound();
  }
  let data = null;
  let error = "";
  try {
    data = await crmRead();
  } catch {
    error = "Your CRM could not be loaded. Please retry.";
  }
  return <CrmWorkspace initialData={data} initialError={error} />;
}
