import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { monthLabel, parseMonth, shiftMonth } from "@/lib/social/schema";
import { SOCIAL_HOME, clientHref, type ClientView } from "@/lib/social/links";
import type { Program } from "@/lib/social/server";

const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const STATUS_PILL: Record<Program["status"], string> = {
  prospect: "bg-slate-100 text-slate-700",
  onboarding: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-slate-100 text-slate-700",
  ended: "bg-slate-100 text-slate-500",
};
export function ClientStatusPill({ status }: { status: Program["status"] }) {
  return <span className={`pill ${STATUS_PILL[status]}`}>{humanize(status)}</span>;
}

/** "Social Media / Client / Sub-account": where this page sits, with a way back up. */
export function Breadcrumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-500">
        {trail.map((step, i) => (
          <li key={`${i}-${step.label}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />}
            {step.href ? (
              <Link href={step.href} className="truncate font-medium text-ocean-700 hover:underline">
                {step.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-medium text-slate-700">
                {step.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PreviewNotice({ production }: { production: boolean }) {
  if (production) return null;
  return (
    <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
      This is a preview. You can look around, but changes are saved from the live system only.
    </p>
  );
}

/** Top of the Social Media front page, which lists every client. */
export function SocialHomeFrame({ production, children }: { production: boolean; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Social Media"
        icon={Megaphone}
        title="Clients"
        subtitle="Each client has its own dashboard. Their hotels, outlets and brand pages are sub-accounts inside it."
      />
      <PreviewNotice production={production} />
      {children}
    </div>
  );
}

const VIEWS: { id: ClientView; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "accounts", label: "Sub-accounts" },
  { id: "board", label: "Production board" },
  { id: "calendar", label: "Calendar" },
  { id: "checks", label: "Checks" },
  { id: "agreement", label: "Agreement" },
];
/** Pages that show one month of work, so they get the month switcher. */
const MONTHLY: readonly ClientView[] = ["dashboard", "accounts", "board", "calendar", "checks"];

/** Shared top of every page of one client: where you are, the client, its tabs and the month. */
export function StudioFrame({
  view,
  program,
  month,
  production,
  accountCount,
  checkErrors = 0,
  children,
}: {
  view: ClientView;
  program: Program;
  month: string;
  production: boolean;
  /** Active sub-accounts, shown on the Sub-accounts tab. */
  accountCount: number;
  /** Pieces with a failed check this month, shown on the Checks tab. */
  checkErrors?: number;
  children: ReactNode;
}) {
  const thisMonth = parseMonth(null);
  const badge = (id: ClientView) =>
    id === "accounts" && accountCount > 0 ? (
      <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">{accountCount}</span>
    ) : id === "checks" && checkErrors > 0 ? (
      <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-rose-700">{checkErrors}</span>
    ) : null;
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Breadcrumbs
          trail={[
            { label: "Social Media", href: SOCIAL_HOME },
            view === "dashboard" ? { label: program.name } : { label: program.name, href: clientHref("dashboard", program.id, month) },
            ...(view === "dashboard" ? [] : [{ label: VIEWS.find((v) => v.id === view)?.label ?? "" }]),
          ]}
        />
        <PageHeader
          eyebrow="Client"
          icon={Building2}
          title={program.name}
          subtitle={
            [
              `${accountCount} ${accountCount === 1 ? "sub-account" : "sub-accounts"}`,
              program.contact_name && `Contact: ${program.contact_name}`,
              program.publishing_tool && `Published from ${program.publishing_tool}`,
            ]
              .filter(Boolean)
              .join(" · ")
          }
        >
          <ClientStatusPill status={program.status} />
        </PageHeader>
      </div>

      <PreviewNotice production={production} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <nav aria-label={`${program.name} pages`} className="flex items-center gap-1 overflow-x-auto">
          {VIEWS.map((v) => (
            <Link
              key={v.id}
              href={clientHref(v.id, program.id, month)}
              aria-current={v.id === view ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                v.id === view ? "border-ocean-600 text-ocean-900" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {v.label}
              {badge(v.id)}
            </Link>
          ))}
        </nav>
        {MONTHLY.includes(view) && (
          <div className="flex items-center gap-1 pb-2">
            <Link href={clientHref(view, program.id, shiftMonth(month, -1))} className="btn-ghost px-2" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span className="min-w-36 text-center font-display text-base font-semibold text-ocean-950">{monthLabel(month)}</span>
            <Link href={clientHref(view, program.id, shiftMonth(month, 1))} className="btn-ghost px-2" aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {month !== thisMonth && (
              <Link href={clientHref(view, program.id, thisMonth)} className="btn-secondary ml-1">
                This month
              </Link>
            )}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}
