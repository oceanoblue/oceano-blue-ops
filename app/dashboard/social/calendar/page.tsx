import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StudioFrame } from "@/components/social-studio/StudioFrame";
import { CalendarGrid } from "@/components/social-studio/CalendarGrid";
import { studioHref } from "@/lib/social/links";
import { studioPage } from "@/lib/social/page";
import { monthLabel, todayKey } from "@/lib/social/schema";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { programs, program, month, workspace, production } = await studioPage(searchParams);
  if (!programs || !program || !workspace) redirect("/dashboard/social");
  return (
    <StudioFrame view="calendar" programs={programs} program={program} month={month} production={production}>
      {workspace.items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CalendarPlus}
            title={`Nothing planned for ${monthLabel(month)}`}
            description="Plan the month from the overview and every account's pieces appear here."
            action={<Link className="btn-primary" href={studioHref("overview", program.id, month)}>Go to the overview</Link>}
          />
        </div>
      ) : (
        <CalendarGrid month={month} items={workspace.items} accounts={workspace.accounts} team={workspace.team} today={todayKey()} />
      )}
    </StudioFrame>
  );
}
