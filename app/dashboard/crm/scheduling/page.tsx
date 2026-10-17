import { notFound } from "next/navigation";
import { crmActor } from "@/lib/crm/server";
import { schedulingRead } from "@/lib/crm/scheduling-server";
import { SchedulingWorkspace } from "@/components/crm/SchedulingWorkspace";
export const dynamic = "force-dynamic";
export default async function Page() {
    try {
        await crmActor();
    }
    catch {
        notFound();
    }
    const initial = await schedulingRead().catch(() => null);
    return <SchedulingWorkspace initialData={initial}/>;
}
