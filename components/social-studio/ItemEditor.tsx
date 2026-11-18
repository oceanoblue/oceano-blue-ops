"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
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
import { useSocialAction } from "./useSocialAction";

type Draft = {
  title: string;
  caption: string;
  pillar: Pillar;
  status: Status;
  scheduled_for: string;
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
  onClose,
}: {
  item: Item;
  accountName: string;
  brandKitUrl?: string;
  team: Member[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(item));
  const { run, busy, error } = useSocialAction();
  const titleId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const before = draftOf(item);
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(draft) as (keyof Draft)[]) {
      if (draft[key] === before[key]) continue;
      patch[key] = key === "scheduled_for" || key === "assignee" ? draft[key] || null : draft[key];
    }
    if (Object.keys(patch).length === 0) return onClose();
    if (await run({ action: "update_item", id: item.id, patch })) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="label">Working title</span>
            <input ref={firstField} className="input" maxLength={200} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="What this piece is about" />
          </label>
          <label>
            <span className="label">Stage</span>
            <select className="input" value={draft.status} onChange={(e) => set("status", e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Publish date</span>
            <input type="date" className="input" value={draft.scheduled_for} onChange={(e) => set("scheduled_for", e.target.value)} />
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
          <label className="sm:col-span-2">
            <span className="label">Live post link</span>
            <input type="url" className="input" maxLength={500} value={draft.published_url} onChange={(e) => set("published_url", e.target.value)} placeholder="https://" />
          </label>
          <label className="sm:col-span-2">
            <span className="label">Review notes</span>
            <textarea className="input min-h-20" maxLength={2000} value={draft.review_note} onChange={(e) => set("review_note", e.target.value)} placeholder="Changes asked for by our team or the client" />
          </label>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/60 px-5 py-3">
          <p role="alert" className="min-h-5 text-sm text-rose-700">{error}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving..." : "Save"}</button>
          </div>
        </footer>
      </form>
    </div>
  );
}
