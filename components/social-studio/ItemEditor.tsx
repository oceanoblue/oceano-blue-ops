"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Sparkles, X } from "lucide-react";
import type { Issue } from "@/lib/social/audit";
import {
  KIND_LABEL,
  PILLARS,
  PILLAR_LABEL,
  STATUSES,
  STATUS_LABEL,
  type Pillar,
  type Status,
} from "@/lib/social/schema";
import type { Item, Member } from "@/lib/social/server";
import { CreativeReview } from "./CreativeReview";
import { DeliveryHistory } from "./DeliveryHistory";
import { useSocialAction } from "./useSocialAction";

type Draft = {
  title: string;
  caption: string;
  pillar: Pillar;
  status: Status;
  scheduled_for: string;
  publish_time: string;
  assignee: string;
  design_url: string;
  published_url: string;
  review_note: string;
};
const draftOf = (i: Item): Draft => ({
  title: i.title,
  caption: i.caption,
  pillar: i.pillar,
  status: i.status,
  scheduled_for: i.scheduled_for ?? "",
  publish_time: i.publish_time?.slice(0, 5) ?? "",
  assignee: i.assignee ?? "",
  design_url: i.design_url,
  published_url: i.published_url,
  review_note: i.review_note,
});

/** Edit one piece of content: what it says, where it is in production, and who has it. */
export function ItemEditor({
  item,
  accountName,
  brandKitUrl,
  team,
  issues = [],
  onClose,
}: {
  item: Item;
  accountName: string;
  brandKitUrl?: string;
  team: Member[];
  /** Failed checks for the saved version of this piece. */
  issues?: Issue[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(item));
  const { run, busy, error } = useSocialAction();
  const drafting = useSocialAction();
  const titleId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(item));
  function dismiss() {
    if (!dirty || window.confirm("Discard your unsaved changes?")) onClose();
  }
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    firstField.current?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload",warn);
    return () => window.removeEventListener("beforeunload",warn);
  },[dirty]);

  async function draftCaption() {
    const result = await drafting.run({ action: "draft_caption", id: item.id, context: {title:draft.title,pillar:draft.pillar,scheduled_for:draft.scheduled_for || null} });
    if (result && typeof result.caption === "string") set("caption", result.caption);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const before = draftOf(item);
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(draft) as (keyof Draft)[]) {
      if (draft[key] === before[key]) continue;
      patch[key] = key === "scheduled_for" || key === "publish_time" || key === "assignee" ? draft[key] || null : draft[key];
    }
    if (Object.keys(patch).length === 0) return onClose();
    if (await run({ action: "update_item", id: item.id, patch })) onClose();
  }

  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();dismiss();}} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-ink-950/50">
      <div className="flex h-full items-end justify-center sm:items-center sm:p-6" onClick={dismiss}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none sm:rounded-b-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ocean-600">
              {KIND_LABEL[item.kind]} {item.slot}
            </div>
            <h2 id={titleId} className="truncate font-display text-xl font-semibold text-ocean-950">
              {accountName}
            </h2>
          </div>
          <button type="button" onClick={dismiss} className="btn-ghost px-2" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2">
          {issues.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-ink-50 p-3 text-sm sm:col-span-2" aria-label="Checks">
              {issues.map((issue) => (
                <li key={issue.code} className={`flex gap-2 ${issue.severity === "error" ? "text-rose-700" : "text-amber-800"}`}>
                  <span className="font-semibold">{issue.severity === "error" ? "Fix:" : "Check:"}</span>
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          {item.client_decision && (
            <div className={`rounded-lg p-3 text-sm sm:col-span-2 ${item.client_decision === "changes" ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"}`}>
              <p className="font-semibold">
                {item.client_decision === "changes" ? "The client asked for a change" : "Approved by the client"}
                <span className="font-normal">
                  {item.client_reviewer && ` · ${item.client_reviewer}`}
                  {item.client_reviewed_at && ` · ${new Date(item.client_reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}`}
                </span>
              </p>
              {item.client_decision === "changes" && (
                <>
                  {item.client_note && <p className="mt-1 whitespace-pre-line">&ldquo;{item.client_note}&rdquo;</p>}
                  <p className="mt-2 text-xs text-amber-900/80">The concern stays on record. Mark it handled after reviewing it. A fresh authorization is required before the piece can be released.</p>
                  <button type="button" className="btn-secondary mt-2" disabled={busy} onClick={async () => (await run({ action: "resolve_client_feedback", id: item.id, revision: item.review_revision })) && onClose()}>
                    Mark as handled
                  </button>
                </>
              )}
            </div>
          )}
          <label className="sm:col-span-2">
            <span className="label">Working title</span>
            <input ref={firstField} className="input" maxLength={200} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="What this piece is about" />
          </label>
          <label>
            <span className="label">Stage</span>
            <select className="input" value={draft.status} onChange={(e) => set("status", e.target.value as Status)}>
              {STATUSES.filter((s) => s === item.status || !["approved", "scheduled", "published"].includes(s)).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Publish date</span>
            <input type="date" className="input" value={draft.scheduled_for} onChange={(e) => set("scheduled_for", e.target.value)} />
          </label>
          <label>
            <span className="label">Publish time at the property</span>
            <input type="time" className="input" value={draft.publish_time} onChange={e => set("publish_time", e.target.value)} />
          </label>
          <label>
            <span className="label">Content type</span>
            <select className="input" value={draft.pillar} onChange={(e) => set("pillar", e.target.value as Pillar)}>
              {PILLARS.map((p) => (
                <option key={p} value={p}>{PILLAR_LABEL[p]}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Assigned to</span>
            <select className="input" value={draft.assignee} onChange={(e) => set("assignee", e.target.value)}>
              <option value="">Nobody yet</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="label flex justify-between">
              Caption <span className="normal-case tracking-normal text-slate-400">{draft.caption.length.toLocaleString()} / 5,000</span>
            </span>
            <textarea className="input min-h-36" maxLength={5000} value={draft.caption} onChange={(e) => set("caption", e.target.value)} />
          </label>
          <div className="-mt-2 flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="button" className="btn-secondary" disabled={drafting.busy} onClick={draftCaption}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {drafting.busy ? "Writing..." : draft.caption ? "Redraft with AI" : "Draft with AI"}
            </button>
            <p className="text-xs text-slate-500">Writes from the working title and the account&apos;s voice notes. Nothing is saved until you press Save.</p>
            <p role="alert" className="w-full text-sm text-rose-700">{drafting.error}</p>
          </div>
          <label className="sm:col-span-2">
            <span className="label flex items-center justify-between gap-3">
              Canva design link
              <span className="flex gap-3 normal-case tracking-normal">
                {brandKitUrl && (
                  <a href={brandKitUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ocean-700 hover:underline">
                    Brand kit <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
                {item.design_url && (
                  <a href={item.design_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ocean-700 hover:underline">
                    Open design <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </span>
            </span>
            <input type="url" className="input" maxLength={500} value={draft.design_url} onChange={(e) => set("design_url", e.target.value)} placeholder="https://www.canva.com/design/..." />
          </label>
          <CreativeReview item={item} onSaved={onClose} disabled={dirty} />
          <DeliveryHistory item={item} issues={issues} close={onClose} disabled={dirty} />
          {(item.status === "published" || draft.published_url) && (
            <label className="sm:col-span-2">
              <span className="label">Live post link</span>
              <input type="url" className="input" maxLength={500} value={draft.published_url} onChange={(e) => set("published_url", e.target.value)} placeholder="https://" />
            </label>
          )}
          <label className="sm:col-span-2">
            <span className="label">Review notes</span>
            <textarea className="input min-h-20" maxLength={2000} value={draft.review_note} onChange={(e) => set("review_note", e.target.value)} placeholder="Changes asked for by our team or the client" />
          </label>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/60 px-5 py-3">
          <p role="alert" className="min-h-5 text-sm text-rose-700">{error}</p>
          <div className="flex gap-2">
            <button type="button" onClick={dismiss} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving..." : "Save"}</button>
          </div>
        </footer>
      </form>
      </div>
    </dialog>
  );
}
