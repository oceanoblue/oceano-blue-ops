import { AgreementManager } from "@/components/social-studio/AgreementManager";
import { ProgramTerms } from "@/components/social-studio/ProgramTerms";
import { StudioFrame } from "@/components/social-studio/StudioFrame";
import { appOrigin } from "@/lib/social/links";
import { clientPage } from "@/lib/social/page";
import { listAgreements } from "@/lib/social/server";

export const dynamic = "force-dynamic";

/** One client's agreements and the terms they were sold on. */
export default async function ClientAgreementPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { program, month, summary, production } = await clientPage(props.params, props.searchParams);
  const agreements = await listAgreements(program.id);
  return (
    <StudioFrame view="agreement" program={program} month={month} production={production} accountCount={summary.accounts} checkErrors={summary.errors}>
      <AgreementManager program={program} agreements={agreements} origin={appOrigin()} />
      <ProgramTerms key={`terms-${program.id}`} program={program} accountCount={summary.accounts} open />
    </StudioFrame>
  );
}
