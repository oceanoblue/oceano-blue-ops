import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { reportHref } from "@/lib/social/links";
import {
  CLIENT_STAGES,
  CLIENT_STAGE_LABEL,
  CLIENT_STAGE_PILL,
  KIND_LABEL,
  monthLabel,
  parseMonth,
  shiftMonth,
  shortDate,
  type ClientStage,
} from "@/lib/social/schema";
import { publicReport, type PublicReport } from "@/lib/social/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your social media report | Oceano Blue Media",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const count = (pieces: PublicReport["accounts"][number]["pieces"], stage: ClientStage) => pieces.filter((p) => p.stage === stage).length;

/** A client's private monthly report. Read-only; opened with the secret link we send them. */
export default async function SocialReportPage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ month?: string | string[] }> }) {
  const { token } = await props.params;
  const month = parseMonth((await props.searchParams).month);
  let report: PublicReport | null;
  try {
    report = await publicReport(token, month);
  } catch {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="font-display text-3xl text-ink-950">Your report is temporarily unavailable</h1>
        <p className="mt-4 text-slate-600">
          Please try again shortly or contact{" "}
          <a className="underline" href="mailto:info@oceanoblue.net">
            info@oceanoblue.net
          </a>
          .
        </p>
      </main>
    );
  }
  if (!report) notFound();

  const { totals } = report;
  const delivered = totals.live + totals.scheduled;
  const planned = CLIENT_STAGES.reduce((n, s) => n + totals[s], 0);
  const needs = report.accounts.filter((a) => a.media !== "good" || a.requests.length > 0);
  const tiles: { label: string; value: number; hint?: string }[] = [
    { label: "Live", value: totals.live },
    { label: "Scheduled", value: totals.scheduled },
    { label: "Approved", value: totals.approved },
    { label: "Ready for your review", value: totals.for_review },
    { label: "In progress", value: totals.in_progress },
  ];

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      <header className="relative overflow-hidden bg-ink-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-56 h-[38rem] w-[38rem] rounded-full bg-ocean-600/25 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
          <BrandLogo variant="white" className="h-8 w-auto sm:h-9" />
          <p className="mt-12 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean-300">Social media report</p>
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight sm:text-6xl">{report.client}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href={reportHref(token, shiftMonth(month, -1))} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-white/20 hover:bg-white/10" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span className="min-w-44 text-center font-display text-2xl">{monthLabel(month)}</span>
            <Link href={reportHref(token, shiftMonth(month, 1))} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-white/20 hover:bg-white/10" aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-200">
            {planned === 0
              ? `Nothing is on the calendar for ${monthLabel(month)} yet.`
              : `${delivered} of ${totals.owed} pieces are live or scheduled across ${report.accounts.length} ${report.accounts.length === 1 ? "account" : "accounts"}.`}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-10 sm:px-8">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-100">
              <dt className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.label}</dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums text-ocean-950">{t.value}</dd>
            </div>
          ))}
        </dl>

        {needs.length > 0 && (
          <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-amber-200">
            <h2 className="font-display text-2xl text-ocean-950">What we need from you</h2>
            <p className="mt-1 text-sm text-slate-600">Fresh photos and short video clips keep each account looking current. Here is where we are running short.</p>
            <ul className="mt-4 divide-y divide-ink-100">
              {needs.map((a) => (
                <li key={a.name} className="py-3">
                  <p className="text-sm font-semibold text-ink-900">{a.name}</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                    {a.media === "out" && <li>We are out of recent photos and video for this account.</li>}
                    {a.media === "low" && <li>We are running low on recent photos and video for this account.</li>}
                    {a.requests.map((r, i) => (
                      <li key={i}>
                        {r.ask}
                        {r.due_on && <span className="text-slate-500"> (by {shortDate(r.due_on)})</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="font-display text-2xl text-ocean-950">By account</h2>
          <div className="mt-4 space-y-3">
            {report.accounts.map((a) => {
              const review = count(a.pieces, "for_review");
              const line = [
                count(a.pieces, "live") > 0 && `${count(a.pieces, "live")} live`,
                count(a.pieces, "scheduled") > 0 && `${count(a.pieces, "scheduled")} scheduled`,
                count(a.pieces, "approved") > 0 && `${count(a.pieces, "approved")} approved`,
                count(a.pieces, "in_progress") > 0 && `${count(a.pieces, "in_progress")} in progress`,
              ].filter(Boolean);
              return (
                <details key={a.name} className="group rounded-2xl bg-white shadow-soft ring-1 ring-ink-100">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-5">
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold text-ink-900">{a.name}</span>
                      <span className="mt-0.5 block text-sm text-slate-600">{a.pieces.length === 0 ? "Nothing on the calendar yet" : line.join(" · ") || `${a.pieces.length} pieces`}</span>
                    </span>
                    {review > 0 && <span className={`pill ${CLIENT_STAGE_PILL.for_review}`}>{review} ready for your review</span>}
                  </summary>
                  {a.pieces.length > 0 && (
                    <ul className="divide-y divide-ink-100 border-t border-ink-100">
                      {a.pieces.map((p, i) => (
                        <li key={i} className="grid gap-2 px-5 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-start">
                          <span className="text-sm tabular-nums text-slate-500">{shortDate(p.date)}</span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-ink-900">
                              {p.title || KIND_LABEL[p.kind]} <span className="font-normal text-slate-500">· {KIND_LABEL[p.kind]}</span>
                            </span>
                            {p.caption && <span className="mt-1 block whitespace-pre-line text-sm leading-relaxed text-slate-700">{p.caption}</span>}
                            {(p.design_url || p.published_url) && (
                              <span className="mt-1.5 flex flex-wrap gap-4">
                                {p.published_url && (
                                  <a href={p.published_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:underline">
                                    See the post <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                  </a>
                                )}
                                {p.design_url && (
                                  <a href={p.design_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:underline">
                                    See the design <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                  </a>
                                )}
                              </span>
                            )}
                          </span>
                          <span className={`pill justify-self-start sm:justify-self-end ${CLIENT_STAGE_PILL[p.stage]}`}>{CLIENT_STAGE_LABEL[p.stage]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              );
            })}
          </div>
        </section>

        <footer className="border-t border-ink-200 pt-6 text-sm text-slate-500">
          <p>This page is private to {report.client}. Please do not forward the link outside your team.</p>
          <p className="mt-1">
            Oceano Blue Media ·{" "}
            <a className="underline" href="mailto:info@oceanoblue.net">
              info@oceanoblue.net
            </a>{" "}
            · 843-505-8586
          </p>
        </footer>
      </main>
    </div>
  );
}
