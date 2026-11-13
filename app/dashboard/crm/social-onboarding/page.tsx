import { notFound } from "next/navigation";
import { crmActor } from "@/lib/crm/server";
import { listIntakes } from "@/lib/social-onboarding/server";
import { SocialOnboardingInbox } from "@/components/crm/SocialOnboardingInbox";

export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await crmActor();
  } catch {
    notFound();
  }
  const intakes = await listIntakes().catch(() => null);
  return (
    <SocialOnboardingInbox
      initial={intakes}
      production={process.env.VERCEL_ENV === "production"}
    />
  );
}
