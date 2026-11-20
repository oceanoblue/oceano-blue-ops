import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { monthLabel, parseMonth, shiftMonth } from "@/lib/social/schema";
import { studioHref, type StudioView } from "@/lib/social/links";
import type { Program } from "@/lib/social/server";

const VIEWS: { id: StudioView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "board", label: "Production board" },
  { id: "calendar", label: "Calendar" },
  { id: "checks", label: "Checks" },
];

/** Shared top of every Social Studio page: title, program switcher, view tabs and month. */
export function StudioFrame({
  view,
  programs,
  program,
  month,
  production,
  checkErrors = 0,
  children,
}: {
  view: StudioView;
  programs: Program[];
  program: Program | null;
  month: string;
  production: boolean;
  /** Pieces with a failed check this month, shown on the Checks tab. */
  checkErrors?: number;
  children: ReactNode;
}) {
  const thisMonth = parseMonth(null);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Social Studio"
        icon={Megaphone}
        title={program ? program.name : "Social media programs"}
        subtitle={
          program
            ? [program.contact_name && `Contact: ${program.contact_name}`, program.publishing_tool && `Published from ${program.publishing_tool}`]
                .filter(Boolean)
                .join(" · ") || "Plan, produce and track every piece of content for this client."
            : "Plan, produce and track social media content for each client."
        }
      >
        {programs.length > 1 && (
          <nav aria-label="Programs" className="flex flex-wrap gap-2">
            {programs.map((p) => (
              <Link
                key={p.id}
                href={studioHref(view, p.id, month)}
                aria-current={p.id === program?.id ? "page" : undefined}
                className={p.id === program?.id ? "btn-primary" : "btn-secondary"}
              >
                {p.name}
              </Link>
            ))}
          </nav>
        )}
      </PageHeader>

      {!production && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          This is a preview. You can look around, but changes are saved from the live system only.
        </p>
      )}

      {program && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
          <nav aria-label="Social Studio views" className="flex items-center gap-1 overflow-x-auto">
            {VIEWS.map((v) => (
              <Link
                key={v.id}
                href={studioHref(v.id, program.id, month)}
                aria-current={v.id === view ? "page" : undefined}
                className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  v.id === view ? "border-ocean-600 text-ocean-900" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {v.label}
                {v.id === "checks" && checkErrors > 0 && (
                  <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-rose-700">{checkErrors}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1 pb-2">
            <Link href={studioHref(view, program.id, shiftMonth(month, -1))} className="btn-ghost px-2" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span className="min-w-36 text-center font-display text-base font-semibold text-ocean-950">{monthLabel(month)}</span>
            <Link href={studioHref(view, program.id, shiftMonth(month, 1))} className="btn-ghost px-2" aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {month !== thisMonth && (
              <Link href={studioHref(view, program.id, thisMonth)} className="btn-secondary ml-1">
                This month
              </Link>
            )}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
