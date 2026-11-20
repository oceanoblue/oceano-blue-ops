import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Board } from "@/components/social-studio/Board";
import { StudioFrame } from "@/components/social-studio/StudioFrame";
import { clientHref } from "@/lib/social/links";
import { clientPage } from "@/lib/social/page";
import { monthLabel } from "@/lib/social/schema";

export const dynamic = "force-dynamic";

export default async function ClientBoardPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { program, month, today, workspace, audit, summary, production } = await clientPage(props.params, props.searchParams);
  return (
    <StudioFrame view="board" program={program} month={month} production={production} accountCount={summary.accounts} checkErrors={summary.errors}>
      {workspace.items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CalendarPlus}
            title={`Nothing planned for ${monthLabel(month)}`}
            description="Plan the month from the dashboard and every sub-account's pieces appear here."
            action={<Link className="btn-primary" href={clientHref("dashboard", program.id, month)}>Go to the dashboard</Link>}
          />
        </div>
      ) : (
        <Board items={workspace.items} accounts={workspace.accounts} team={workspace.team} today={today} audit={audit} />
      )}
    </StudioFrame>
  );
}
