import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { ChecksList } from "@/components/social-studio/ChecksList";
import { StudioFrame } from "@/components/social-studio/StudioFrame";
import { countIssues } from "@/lib/social/audit";
import { clientPage } from "@/lib/social/page";
import { monthLabel } from "@/lib/social/schema";

export const dynamic = "force-dynamic";

export default async function ClientChecksPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { program, month, workspace, audit, summary, production } = await clientPage(props.params, props.searchParams);
  const totals = countIssues(audit);
  return (
    <StudioFrame view="checks" program={program} month={month} production={production} accountCount={summary.accounts} checkErrors={summary.errors}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pieces checked" value={workspace.items.length} hint={monthLabel(month)} icon={ShieldCheck} />
        <StatCard label="Must fix" value={totals.errors} accent={totals.errors === 0} />
        <StatCard label="Worth checking" value={totals.warnings} />
        <StatCard label="Approved but held" value={summary.held} hint="not sent to scheduling until fixed" />
      </div>
      {workspace.items.length === 0 ? (
        <div className="card">
          <EmptyState icon={ShieldCheck} title={`Nothing planned for ${monthLabel(month)}`} description="Checks run on every piece as soon as the month is planned." />
        </div>
      ) : (
        <ChecksList items={workspace.items} accounts={workspace.accounts} team={workspace.team} audit={audit} />
      )}
    </StudioFrame>
  );
}
