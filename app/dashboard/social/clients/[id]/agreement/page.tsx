import { ReportingSettings } from "@/components/social-studio/ReportingSettings";
import { monthlyResult } from "@/lib/social/reporting";
import { AgreementManager } from "@/components/social-studio/AgreementManager";
import { ProgramTerms } from "@/components/social-studio/ProgramTerms";
import { StudioFrame } from "@/components/social-studio/StudioFrame";
import { appOrigin } from "@/lib/social/links";
import { clientPage } from "@/lib/social/page";
import { linkedIntakes } from "@/lib/social-onboarding/server";
import { listAgreements } from "@/lib/social/server";

export const dynamic = "force-dynamic";

/** One client's agreements and the terms they were sold on. */
export default async function ClientAgreementPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { program, month, summary, production } = await clientPage(props.params, props.searchParams);
  const [agreements, intakes] = await Promise.all([listAgreements(program.id), linkedIntakes(program.id)]);
  return (
    <StudioFrame view="agreement" program={program} month={month} production={production} accountCount={summary.accounts} checkErrors={summary.errors}>
      <AgreementManager program={program} agreements={agreements} origin={appOrigin()} />
      <ReportingSettings key={program.id+month} program={program.id} month={month} initial={program.reporting_mode ?? "progress"} report={program.reporting_mode === "agency_report" ? await monthlyResult(program.id,month) : null} production={production}/>
      {intakes.length > 0 && <section className="card p-5">
        <h2 className="font-display text-lg font-semibold">Onboarding submissions</h2>
        {intakes.map(intake => <a className="mt-2 block text-sm underline" key={intake.id} href={`/dashboard/crm/social-onboarding?intake=${intake.id}`}>
          {intake.business_name} · {new Date(intake.created_at).toLocaleDateString("en-US", {timeZone:"America/New_York"})}
        </a>)}
      </section>}
      <ProgramTerms key={`terms-${program.id}`} program={program} accountCount={summary.accounts} open />
    </StudioFrame>
  );
}
