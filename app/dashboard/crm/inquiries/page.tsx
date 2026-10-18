import { notFound } from "next/navigation";
import { crmActor } from "@/lib/crm/server";
import { inquiryRead } from "@/lib/crm/inquiry-server";
import { InquiryInbox } from "@/components/crm/InquiryInbox";

export const dynamic = "force-dynamic";

export default async function Page() {
  let actor: string;
  try {
    actor = await crmActor();
  } catch {
    notFound();
  }
  const initialData = await inquiryRead(actor).catch(() => null);
  return <InquiryInbox initialData={initialData} />;
}
