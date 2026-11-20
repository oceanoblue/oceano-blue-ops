import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, UploadCloud } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { ApproveAll, NoteForm, PieceActions } from "@/components/social/ClientPortal";
import { Meter, VIZ } from "@/components/social-studio/Charts";
import { SocialLogo } from "@/components/social-studio/Logo";
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
  title: "Your social media | Oceano Blue Media",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const count = (pieces: PublicReport["accounts"][number]["pieces"], stage: ClientStage) => pieces.filter((p) => p.stage === stage).length;

/**
 * A client's private page, opened with the secret link we send them: each
 * month by account, with a way to approve pieces, ask for changes, send the
 * team a note and see what media is needed. It shows this one client only,
 * and nothing the office keeps for itself.
 */
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

  const readOnly = process.env.VERCEL_ENV !== "production";
  const { totals } = report;
  const delivered = totals.live + totals.scheduled;
  const planned = CLIENT_STAGES.reduce((n, s) => n + totals[s], 0);
  const needs = report.accounts.filter((a) => a.media !== "good" || a.requests.length > 0);
  // A piece's journey in order, lightest to darkest: the darker the bar, the closer to live.
  const tiles = CLIENT_STAGES.map((stage, i) => ({ stage, label: CLIENT_STAGE_LABEL[stage], value: totals[stage], color: VIZ.ramp[i] }));
  const percent = totals.owed > 0 ? Math.min(100, Math.round((delivered / totals.owed) * 100)) : 0;

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      <header className="relative overflow-hidden bg-ink-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-56 h-[38rem] w-[38rem] rounded-full bg-ocean-600/25 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
          <BrandLogo variant="white" className="h-8 w-auto sm:h-9" />
          <div className="mt-12 flex flex-col gap-5 sm:flex-row sm:items-center">
            {report.logo_url && <SocialLogo name={report.client} url={report.logo_url} size="xl" />}
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean-300">Your social media</p>
              <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight sm:text-6xl">{report.client}</h1>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href={reportHref(token, shiftMonth(month, -1))} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-white/20 hover:bg-white/10" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span className="min-w-44 text-center font-display text-2xl">{monthLabel(month)}</span>
            <Link href={reportHref(token, shiftMonth(month, 1))} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-white/20 hover:bg-white/10" aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          {planned === 0 ? (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-200">Nothing is on the calendar for {monthLabel(month)} yet.</p>
          ) : (
            <div className="mt-8 max-w-xl">
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-5xl font-bold leading-none tracking-tight sm:text-6xl">{percent}%</span>
                <span className="text-base text-ink-100">
                  live or scheduled, {delivered} of {totals.owed} pieces across {report.accounts.length} {report.accounts.length === 1 ? "account" : "accounts"}
                </span>
              </p>
              <div className="mt-4">
                <Meter dark thick done={delivered} inProgress={planned - delivered} total={totals.owed} label={`${delivered} of ${totals.owed} pieces live or scheduled, ${planned - delivered} more on the way`} />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-10 sm:px-8">
        <section aria-label="Where every piece is">
          {planned > 0 && (
            <div className="mb-3 flex h-2 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={tiles.map((t) => `${t.value} ${t.label.toLowerCase()}`).join(", ")}>
              {tiles.map((t) => (t.value > 0 ? <span key={t.stage} className="h-full rounded-full" style={{ width: `${(t.value / planned) * 100}%`, backgroundColor: t.color }} /> : null))}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {tiles.map((t) => (
              <div key={t.stage} className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-100">
                <dt className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: t.color }} />
                  {t.label}
                </dt>
                <dd className="mt-1 text-3xl font-bold text-ocean-950">{t.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {totals.for_review > 0 && (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <strong>
              {totals.for_review} {totals.for_review === 1 ? "piece is" : "pieces are"} ready for your review.
            </strong>{" "}
            Open an account marked &ldquo;ready for your review&rdquo; below to approve it or ask for changes.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink-100">
            <h2 className="font-display text-2xl text-ocean-950">Tell us something</h2>
            <p className="mt-1 text-sm text-slate-600">An event coming up, a promotion, a correction or a question. It goes straight to our team.</p>
            <div className="mt-4">
              <NoteForm token={token} readOnly={readOnly} accounts={report.accounts.map((a) => ({ id: a.id, name: a.name }))} />
            </div>
          </section>
          <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink-100">
            <h2 className="font-display text-2xl text-ocean-950">Send photos and video</h2>
            <p className="mt-1 text-sm text-slate-600">
              Fresh photos and short clips are what make each account look current. Phone photos and 10 to 20 second clips are perfect.
            </p>
            {report.media_upload_url ? (
              <a href={report.media_upload_url} target="_blank" rel="noreferrer" className="btn-primary mt-4">
                <UploadCloud className="h-4 w-4" aria-hidden="true" /> Open the shared folder
              </a>
            ) : (
              <p className="mt-4 text-sm text-slate-700">
                Email them to{" "}
                <a className="font-semibold text-ocean-700 underline" href="mailto:info@oceanoblue.net">
                  info@oceanoblue.net
                </a>{" "}
                or use the shared folder we set up with you.
              </p>
            )}
          </section>
        </div>

        <details className="rounded-2xl bg-white shadow-soft ring-1 ring-ink-100 print:hidden">
          <summary className="cursor-pointer p-5 text-base font-semibold text-ink-900">How this page works</summary>
          <ul className="list-disc space-y-1.5 px-10 pb-5 text-sm leading-relaxed text-slate-700">
            <li>Use the arrows at the top to move between months.</li>
            <li>Every piece is one of: in progress, ready for your review, approved, scheduled or live.</li>
            <li>You see the caption and design once a piece is ready for your review. Before that you see its topic and date.</li>
            <li>Approve a piece, or ask for changes and tell us what to change. You can also ask for a change after a piece is approved or live.</li>
            <li>This page is private to {report.client}. Anyone with the link can use it, so please share it only with your team.</li>
          </ul>
        </details>

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
                    <span className="flex min-w-0 items-center gap-3">
                      <SocialLogo name={a.name} url={a.logo_url} size="md" />
                      <span className="min-w-0">
                      <span className="block text-base font-semibold leading-snug text-ink-900">{a.name}</span>
                        <span className="mt-0.5 block text-sm text-slate-600">{a.pieces.length === 0 ? "Nothing on the calendar yet" : line.join(" · ") || `${a.pieces.length} pieces`}</span>
                      </span>
                    </span>
                    {review > 0 && <span className={`pill ${CLIENT_STAGE_PILL.for_review}`}>{review} ready for your review</span>}
                  </summary>
                  {review > 1 && (
                    <div className="flex border-t border-ink-100 px-5 py-3">
                      <ApproveAll token={token} accountId={a.id} month={month} count={review} readOnly={readOnly} />
                    </div>
                  )}
                  {a.pieces.length > 0 && (
                    <ul className="divide-y divide-ink-100 border-t border-ink-100">
                      {a.pieces.map((p, i) => (
                        <li key={p.id || i} className="grid gap-2 px-5 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-start">
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
                            {p.feedback && (
                              <span className="mt-2 block rounded-lg bg-ink-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-ink-100">
                                {p.feedback.decision === "approved" ? "Approved" : "Change requested"}
                                {p.feedback.by && ` by ${p.feedback.by}`}
                                {p.feedback.at && ` on ${shortDate(p.feedback.at.slice(0, 10))}`}
                                {p.feedback.decision === "changes" && p.feedback.note && <span className="mt-1 block whitespace-pre-line text-slate-600">&ldquo;{p.feedback.note}&rdquo;</span>}
                              </span>
                            )}
                            {p.id && <PieceActions key={`${p.id}-${p.stage}`} token={token} itemId={p.id} canApprove={p.stage === "for_review"} readOnly={readOnly} />}
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
