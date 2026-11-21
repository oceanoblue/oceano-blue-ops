"use client";
import { useEffect, useState } from "react";
import { CheckCheck, ExternalLink, Radio, RotateCcw, Send } from "lucide-react";
import type { Issue } from "@/lib/social/audit";
import { hasError } from "@/lib/social/audit";
import { PLATFORM_LABEL, STATUS_LABEL, readyToAuthorize, type Platform } from "@/lib/social/schema";
import type { Item } from "@/lib/social/server";
import { useSocialAction } from "./useSocialAction";

type Details = {
  program_id: string;
  approval_mode: string;
  publishing_enabled: boolean;
  reviews: { revision: number; event: string; actor_name: string; note: string; created_at: string }[];
  deliveries: { platform: string; state: string; revision: number; provider_id: string | null; live_url: string; attempts: number; detail: string; updated_at: string; lease_until: string }[];
};

/** What happened, in the words the team uses. */
const EVENT_LABEL: Record<string, string> = {
  approved: "Authorized",
  changes: "Changes requested",
  handled: "Change handled",
  scheduled: "Marked scheduled",
  published: "Marked live",
  reopened: "Moved back to authorized",
};
const DELIVERY_LABEL: Record<string, string> = {
  queued: "Waiting for the publisher",
  claimed: "With the publisher",
  scheduled: "Scheduled",
  published: "Live",
  failed: "Did not go out",
  uncertain: "Needs a check at the platform",
  cancelled: "Cancelled",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The next publishing step for one piece, and the record of what has happened to it. */
export function DeliveryHistory({ item, issues = [], close, disabled }: { item: Item; issues?: Issue[]; close: () => void; disabled: boolean }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [problem, setProblem] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const { run, busy, error } = useSocialAction();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/social/pieces/${item.id}/history`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Review and delivery history is unavailable.");
        setDetails(await response.json());
      })
      .catch((e) => {
        if (!controller.signal.aborted) setProblem(e.message);
      });
    return () => controller.abort();
  }, [item.id, item.status, item.review_revision]);

  const revision = item.review_revision ?? 1;
  const officeLed = details?.approval_mode === "office";
  const byHand = details ? !details.publishing_enabled : false;
  const current = item.approved_revision != null && item.approved_revision === revision && item.client_decision !== "changes";
  const blocked = hasError(issues);
  const link = liveUrl.trim();
  const linkOk = link === "" || /^https:\/\/\S+$/.test(link);
  const mark = async (event: "scheduled" | "published" | "reopened", published_url = "") => {
    if (!details) return;
    if (await run({ action: "mark_delivered", program_id: details.program_id, event, items: [{ id: item.id, revision }], published_url })) close();
  };

  let next: React.ReactNode = null;
  if (details) {
    if (item.status === "published") {
      next = (
        <>
          <p className="text-slate-700">This piece is live.{item.published_url && <> <a className="font-semibold text-ocean-700 underline" href={item.published_url} target="_blank" rel="noreferrer">Open the live post</a></>}</p>
          {byHand && (
            <button type="button" className="btn-ghost mt-2" disabled={disabled || busy} onClick={() => mark("reopened")}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Marked by mistake? Move it back
            </button>
          )}
        </>
      );
    } else if (item.status === "scheduled") {
      next = byHand ? (
        <>
          <p className="text-slate-700">Scheduled. Once the post is up, mark it live. The link is optional.</p>
          <label className="mt-2 block">
            <span className="label">Link to the live post</span>
            <input className="input" type="url" inputMode="url" placeholder="https://" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} aria-invalid={!linkOk} />
          </label>
          {!linkOk && <p className="mt-1 text-rose-700">The link has to start with https://</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={disabled || busy || !linkOk} onClick={() => mark("published", link)}>
              <Radio className="h-4 w-4" aria-hidden="true" /> Mark as live
            </button>
            <button type="button" className="btn-ghost" disabled={disabled || busy} onClick={() => mark("reopened")}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Not scheduled after all
            </button>
          </div>
        </>
      ) : (
        <p className="text-slate-700">Scheduled through the connected publisher. It turns live here when the platform confirms it.</p>
      );
    } else if (item.status === "approved") {
      next = !current ? (
        <p className="text-slate-700">This piece changed after it was authorized, or the client asked for a change. It needs a fresh authorization before it can go out.</p>
      ) : byHand ? (
        <>
          <p className="text-slate-700">Authorized. Schedule it in the publishing tool, then record it here.</p>
          <button type="button" className="btn-primary mt-2" disabled={disabled || busy} onClick={() => mark("scheduled")}>
            <Send className="h-4 w-4" aria-hidden="true" /> Mark as scheduled
          </button>
        </>
      ) : (
        <p className="text-slate-700">Authorized. The connected publisher picks it up from here.</p>
      );
    } else if (officeLed && (item.status === "internal_review" || item.status === "client_review")) {
      const ready = readyToAuthorize(item) && !blocked;
      next = (
        <>
          <p className="text-slate-700">
            {ready
              ? "We decide what to post for this client. Authorize this piece when the caption and date are right."
              : blocked
                ? "Fix the items listed above, then authorize this piece."
                : "Add the caption and the publish date, save, then authorize this piece."}
          </p>
          <button
            type="button"
            className="btn-primary mt-2"
            disabled={disabled || busy || !ready}
            onClick={async () => {
              if (await run({ action: "authorize_piece", id: item.id, revision })) close();
            }}
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" /> Authorize for publishing
          </button>
        </>
      );
    } else if (officeLed) {
      next = <p className="text-slate-700">We decide what to post for this client. Move this piece to “{STATUS_LABEL.internal_review}” when it is ready, then authorize it.</p>;
    } else if (item.status === "client_review") {
      next = <p className="text-slate-700">Waiting on the client. It moves to authorized as soon as they approve it on their page.</p>;
    } else {
      next = <p className="text-slate-700">The client approves this piece on their page once it reaches “{STATUS_LABEL.client_review}”.</p>;
    }
  }

  return (
    <section className="rounded-xl bg-ink-50/70 p-4 text-sm ring-1 ring-ink-100 sm:col-span-2">
      <h3 className="font-display text-base font-semibold text-ink-900">Next step</h3>
      <div className="mt-1">{details ? next : !problem && <p className="text-slate-500">Loading...</p>}</div>
      {disabled && details && <p className="mt-2 text-slate-500">Save your changes first.</p>}
      {(problem || error) && <p role="alert" className="mt-2 text-rose-700">{problem || error}</p>}
      {details && details.reviews.length + details.deliveries.length > 0 && (
        <details className="mt-3 border-t border-ink-200 pt-3">
          <summary className="cursor-pointer font-medium text-ink-900">History ({details.reviews.length + details.deliveries.length})</summary>
          <ul className="mt-2 space-y-1.5 text-slate-600">
            {details.reviews.map((entry, i) => (
              <li key={`r${i}`}>
                <span className="font-medium text-ink-900">{EVENT_LABEL[entry.event] ?? entry.event}</span> by {entry.actor_name || "the team"} · {when(entry.created_at)}
                {entry.note && <span className="block text-slate-500">{entry.note}</span>}
              </li>
            ))}
            {details.deliveries.map((entry, i) => (
              <li key={`d${i}`}>
                <span className="font-medium text-ink-900">{PLATFORM_LABEL[entry.platform as Platform] ?? entry.platform}</span> · {DELIVERY_LABEL[entry.state] ?? entry.state} · {when(entry.updated_at)}
                {entry.live_url && (
                  <a className="ml-1 inline-flex items-center gap-1 font-medium text-ocean-700 underline" href={entry.live_url} target="_blank" rel="noreferrer">
                    Open <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
                {entry.detail && <span className="block text-slate-500">{entry.detail}</span>}
                {entry.state === "failed" && <span className="block text-slate-500">It can be retried for this platform only.</span>}
                {entry.state === "uncertain" && <span className="block text-slate-500">Check the platform before retrying, so it does not post twice.</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
