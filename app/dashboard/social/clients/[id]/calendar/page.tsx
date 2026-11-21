import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarGrid } from "@/components/social-studio/CalendarGrid";
import { StudioFrame } from "@/components/social-studio/StudioFrame";
import { clientHref } from "@/lib/social/links";
import { calendarItems } from "@/lib/social/server";
import { auditMonth } from "@/lib/social/audit";
import { clientPage } from "@/lib/social/page";
import { monthLabel } from "@/lib/social/schema";

export const dynamic = "force-dynamic";

export default async function ClientCalendarPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { program, month, today, workspace, summary, production } = await clientPage(props.params, props.searchParams);
  const items = await calendarItems(program.id, month);
  // Duplicate captions are checked within their allocation month in the board.
  const audit = Object.assign({}, ...Array.from(new Set(items.map(i => i.month))).map(allocation =>
    auditMonth(items.filter(i => i.month === allocation), workspace.accounts, program.avoid_terms, today)));
  return (
    <StudioFrame view="calendar" program={program} month={month} production={production} accountCount={summary.accounts} checkErrors={summary.errors}>
      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CalendarPlus}
            title={`Nothing planned for ${monthLabel(month)}`}
            description="Plan the month from the dashboard and every sub-account's pieces appear here."
            action={<Link className="btn-primary" href={clientHref("dashboard", program.id, month)}>Go to the dashboard</Link>}
          />
        </div>
      ) : (
        <CalendarGrid month={month} items={items} accounts={workspace.accounts} team={workspace.team} today={today} audit={audit} />
      )}
    </StudioFrame>
  );
}
