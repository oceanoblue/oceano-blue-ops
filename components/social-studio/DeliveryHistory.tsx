"use client";
import { useEffect, useState } from "react";
import type { Item } from "@/lib/social/server";
import { useSocialAction } from "./useSocialAction";

type Details = {
  approval_mode: string; publishing_enabled: boolean;
  reviews: { revision: number; event: string; actor_name: string; note: string; created_at: string }[];
  deliveries: { platform: string; state: string; revision: number; provider_id: string | null; live_url: string; attempts: number; detail: string; updated_at: string; lease_until: string }[];
};
export function DeliveryHistory({ item, close, disabled }: { item: Item; close: () => void; disabled: boolean }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [problem, setProblem] = useState("");
  const { run, busy, error } = useSocialAction();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/social/pieces/${item.id}/history`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Review and delivery history is unavailable.");
      setDetails(await response.json());
    }).catch(e => { if (!controller.signal.aborted) setProblem(e.message); });
    return () => controller.abort();
  }, [item.id]);
  return <section className="rounded-lg border border-ink-200 p-3 text-sm sm:col-span-2">
    <h3 className="font-semibold">Review and delivery · revision {item.review_revision}</h3>
    {details?.approval_mode === "office" && ["client_review","internal_review"].includes(item.status) &&
      <button type="button" disabled={disabled || busy || !item.creative_path} className="btn-secondary mt-2" onClick={async () => {
        if (await run({ action: "authorize_piece", id: item.id, revision: item.review_revision })) close();
      }}>Authorize this saved revision</button>}
    {details && <p className="mt-1 text-sm">{details.publishing_enabled ? "Publisher handoff enabled for this client." : "Publishing is in test mode for this client."}</p>}
    {details?.reviews.map((entry, i) => <p key={i} className="mt-1">Revision {entry.revision} · {entry.event} · {entry.actor_name} · {new Date(entry.created_at).toLocaleString()}{entry.note && ` · ${entry.note}`}</p>)}
    {details?.deliveries.map((entry, i) => <p key={i} className="mt-1"><strong>{entry.platform}</strong> · {entry.state} · revision {entry.revision} · {entry.attempts} attempt(s) · {new Date(entry.updated_at).toLocaleString()}
      {entry.provider_id && ` · provider ID ${entry.provider_id}`}{entry.detail && ` · ${entry.detail}`}
      {entry.live_url && <> · <a className="underline" href={entry.live_url} target="_blank" rel="noreferrer">Open live post</a></>}
      {entry.state === "failed" && " · Available for a destination-only retry."}
      {entry.state === "uncertain" && " · Confirm the result at the provider before retrying."}</p>)}
    {(problem || error) && <p role="alert" className="mt-1 text-rose-700">{problem || error}</p>}
  </section>;
}
