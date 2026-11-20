"use client";

import { useState } from "react";
import { ExternalLink, Link2, RefreshCw } from "lucide-react";
import { reportHref } from "@/lib/social/links";
import type { Program } from "@/lib/social/server";
import { CopyButton } from "./ProgramSetup";
import { useSocialAction } from "./useSocialAction";

/**
 * The client's private report page: switch it on, copy the link, replace it
 * or switch it off. Anyone holding the link can read the report, so a new
 * link is the way to cut off an old one.
 */
export function ReportLink({ program, origin }: { program: Pick<Program, "id" | "name" | "report_token">; origin: string }) {
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
          <h2 className="font-display text-lg font-semibold text-ocean-950">Client report page</h2>
          <p className="mt-0.5 max-w-prose text-sm text-slate-600">
            A private page for {program.name}: each month by sub-account, what is live, what is waiting on them and the media we still need. It never shows fees, staff notes or check results.
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
    </section>
  );
}
