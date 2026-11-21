import { notFound } from "next/navigation";
import { crmActor } from "@/lib/crm/server";
import { INTAKE_PAGE_SIZE, listIntakes, listIntakeProgramChoices } from "@/lib/social-onboarding/server";
import { SocialOnboardingInbox } from "@/components/crm/SocialOnboardingInbox";

export const dynamic = "force-dynamic";

export default async function Page({searchParams}: {searchParams: Promise<{intake?: string}>}) {
  try {
    await crmActor();
  } catch {
    notFound();
  }
  const { intake } = await searchParams;
  if (intake && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(intake)) notFound();
  const [intakes, programs] = await Promise.all([listIntakes({ id: intake }).catch(() => null), listIntakeProgramChoices().catch(() => null)]);

  return (
    <SocialOnboardingInbox
      initial={intakes}
      programs={programs}
      more={!intake && intakes?.length === INTAKE_PAGE_SIZE}
      production={process.env.VERCEL_ENV === "production"}
    />
  );
}
