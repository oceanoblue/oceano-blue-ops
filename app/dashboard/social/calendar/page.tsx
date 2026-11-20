import { redirect } from "next/navigation";
import { SOCIAL_HOME, clientHref } from "@/lib/social/links";
import { legacyTarget } from "@/lib/social/page";

export const dynamic = "force-dynamic";

/** This page moved under each client. Old links are sent to the right place. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { clientId, month } = await legacyTarget(searchParams);
  redirect(clientId ? clientHref("calendar", clientId, month) : SOCIAL_HOME);
}
