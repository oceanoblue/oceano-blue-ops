"use client";

import { useState } from "react";
import { BookOpen, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { CLIENT_GUIDE_HREF, reportHref } from "@/lib/social/links";
import type { ClientNote, Program } from "@/lib/social/server";
import { CopyButton } from "./ProgramSetup";
import { useSocialAction } from "./useSocialAction";

/**
 * The client's private report page: switch it on, copy the link, replace it
 * or switch it off. Anyone holding the link can read the report, so a new
 * link is the way to cut off an old one.
 */
export function ReportLink({ program, origin }: { program: Pick<Program, "id" | "name" | "report_token" | "approval_mode">; origin: string }) {
  const { run, busy, error } = useSocialAction();
  const [confirming, setConfirming] = useState<"replace" | "off" | null>(null);
  const url = program.report_token ? `${origin}${reportHref(program.report_token)}` : "";

  async function set(enabled: boolean) {
    await run({ action: "set_report_link", id: program.id, enabled });
    setConfirming(null);
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ocean-950">The client&apos;s page</h2>
          <p className="mt-0.5 max-w-prose text-sm text-slate-600">
            {program.name} can follow monthly progress by sub-account, flag a concern and see media requests.
            {program.approval_mode === "office" ? " Your office handles routine approvals." : " The client can also approve content here."}
          </p>
        </div>
        {!program.report_token && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => set(true)}>
            <Link2 className="h-4 w-4" aria-hidden="true" /> {busy ? "Creating..." : "Create the link"}
          </button>
        )}
      </div>

      {program.report_token && (
        <div className="mt-4 space-y-3">
          <input className="input font-mono text-xs" readOnly value={url} aria-label="Client report link" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={url} label="Copy link" className="btn-primary" />
            <a className="btn-secondary" href={reportHref(program.report_token)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open as the client
            </a>
            {confirming ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                {confirming === "replace" ? "The current link will stop working. Continue?" : "The client will no longer be able to open the report. Continue?"}
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => set(confirming === "replace")}>
                  {busy ? "Working..." : "Yes"}
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirming(null)}>
                  No
                </button>
              </span>
            ) : (
              <>
                <button type="button" className="btn-ghost" onClick={() => setConfirming("replace")}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> New link
                </button>
                <button type="button" className="btn-ghost" onClick={() => setConfirming("off")}>
                  Switch off
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500">Anyone with this link can read the report. Send it only to the client.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}

      {/* The guide uses sample content, so it is the same file for every client. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-900">Client guide</h3>
          <p className="mt-0.5 max-w-prose text-sm text-slate-600">
            A short PDF that shows the client how to use their page and sign their agreement, on a phone or a computer. Send it along with their link. It is also linked on their page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a className="btn-secondary" href={CLIENT_GUIDE_HREF} target="_blank" rel="noreferrer">
            <BookOpen className="h-4 w-4" aria-hidden="true" /> Open the guide
          </a>
          <CopyButton text={`${origin}${CLIENT_GUIDE_HREF}`} label="Copy guide link" />
        </div>
      </div>
    </section>
  );
}

/** Notes the client sent from their page, waiting for someone to deal with them. */
export function ClientNotes({ notes, accountNames, changeRequests, checksHref }: { notes: ClientNote[]; accountNames: Record<string, string>; changeRequests: number; checksHref: string }) {
  const { run, busy, error } = useSocialAction();
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ocean-950">From the client</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {notes.length === 0 && changeRequests === 0
              ? "No notes or change requests are waiting."
              : `${notes.length} ${notes.length === 1 ? "note" : "notes"} and ${changeRequests} change ${changeRequests === 1 ? "request" : "requests"} waiting.`}
          </p>
        </div>
        {changeRequests > 0 && (
          <a href={checksHref} className="btn-secondary">
            See change requests
          </a>
        )}
      </div>
      {notes.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-100">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line text-sm text-ink-900">{n.message}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {n.author}
                  {n.account_id && accountNames[n.account_id] && ` · ${accountNames[n.account_id]}`} ·{" "}
                  {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}
                </p>
              </div>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => run({ action: "resolve_client_note", id: n.id })}>
                Mark done
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
