import { notFound } from "next/navigation";
import { z } from "zod";
import { crmActor } from "@/lib/crm/server";
import { acquisitionRead } from "@/lib/crm/acquisition-server";
import { AcquisitionWorkspace } from "@/components/crm/AcquisitionWorkspace";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string }>;
}) {
  try {
    await crmActor();
  } catch {
    notFound();
  }
  const contact = z
    .string()
    .uuid()
    .optional()
    .safeParse((await searchParams).contact);
  if (!contact.success) notFound();
  const initial = await acquisitionRead("", contact.data).catch(() => null);
  return (
    <AcquisitionWorkspace
      key={contact.data ?? "all"}
      initialData={initial}
      contactId={contact.data}
    />
  );
}
