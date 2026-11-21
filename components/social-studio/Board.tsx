"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, CheckCheck, Clapperboard, Palette, Radio, Send } from "lucide-react";
import {
  KIND_LABEL,
  PILLAR_LABEL,
  STATUSES,
  STATUS_BAR,
  STATUS_LABEL,
  isLate,
  readyToAuthorize,
  shortDate,
  type ApprovalMode,
  type Status,
} from "@/lib/social/schema";
import { officeCreativeHref } from "@/lib/social/links";
import type { Account, Item, Member } from "@/lib/social/server";
import { hasError, type Issue } from "@/lib/social/audit";
import { ItemEditor } from "./ItemEditor";
import { useItemFilters } from "./ItemFilters";
import { useSocialAction } from "./useSocialAction";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** How a client works: who approves, and whether we record publishing by hand. */
export type BoardClient = { id: string; month: string; approval_mode: ApprovalMode; publishing_enabled: boolean };
type Bulk = "authorize" | "scheduled" | "published";

/** The month's pieces as columns, one per production stage. */
export function Board({ initialItem, items, accounts, team, today, audit = {}, client }: { initialItem?: string; items: Item[]; accounts: Account[]; team: Member[]; today: string; audit?: Record<string, Issue[]>; client: BoardClient }) {
  const { visible, controls } = useItemFilters(items, accounts, team, audit);
  const [open, setOpen] = useState<string | null>(initialItem ?? null);
  const { run, busy, error } = useSocialAction();
  const [asking, setAsking] = useState<Bulk | null>(null);
  const [done, setDone] = useState("");
  /** We decide what to post for this client, so the office authorizes each piece. */
  const officeLed = client.approval_mode === "office";
  /** Posts are scheduled in the publishing tool by hand, so we record it here. */
  const byHand = !client.publishing_enabled;
  const ref = (i: Item) => ({ id: i.id, revision: i.review_revision ?? 1 });
  const current = (i: Item) => i.approved_revision != null && i.approved_revision === i.review_revision && i.client_decision !== "changes";
  const bulk = useMemo(() => ({
    authorize: officeLed ? visible.filter((i) => readyToAuthorize(i) && !hasError(audit[i.id])) : [],
    scheduled: byHand ? visible.filter((i) => i.status === "approved" && current(i)) : [],
    // Only posts whose day has come: a post dated next week is not live yet.
    published: byHand ? visible.filter((i) => i.status === "scheduled" && !!i.scheduled_for && i.scheduled_for <= today) : [],
  }), [visible, audit, officeLed, byHand, today]);
  const BULK: { key: Bulk; label: (n: number) => string; confirm: (n: number) => string; icon: typeof Send }[] = [
    { key: "authorize", label: (n) => `Authorize ${n} ready`, confirm: (n) => `Authorize ${n} ${n === 1 ? "piece" : "pieces"} for publishing?`, icon: CheckCheck },
    { key: "scheduled", label: (n) => `Mark ${n} scheduled`, confirm: (n) => `Mark ${n} authorized ${n === 1 ? "piece" : "pieces"} as scheduled?`, icon: Send },
    { key: "published", label: (n) => `Mark ${n} live`, confirm: (n) => `Mark ${n} scheduled ${n === 1 ? "piece" : "pieces"}, dated today or earlier, as live?`, icon: Radio },
  ];
  async function runBulk(kind: Bulk) {
    const list = bulk[kind];
    setAsking(null);
    setDone("");
    if (kind === "authorize") {
      const result = await run({ action: "authorize_ready", program_id: client.id, month: client.month, ids: list.map((i) => i.id) });
      if (result) setDone(`Authorized ${result.authorized}.${Number(result.skipped) > 0 ? ` ${result.skipped} need attention first.` : ""}`);
      return;
    }
    // The server takes up to 300 pieces at a time.
    let marked = 0;
    for (let from = 0; from < list.length; from += 300) {
      const result = await run({ action: "mark_delivered", program_id: client.id, event: kind, items: list.slice(from, from + 300).map(ref) });
      if (!result) return;
      marked += Number(result.marked);
    }
    setDone(`Marked ${marked} as ${kind === "published" ? "live" : "scheduled"}.`);
  }
  /** The one obvious next step for a piece, as a button on its card. */
  function step(item: Item, following: Status | undefined): { label: string; go: () => void } | null {
    const openIt = () => setOpen(item.id);
    if (item.status === "published") return null;
    if (item.status === "scheduled")
      return byHand ? { label: "Mark live", go: () => void run({ action: "mark_delivered", program_id: client.id, event: "published", items: [ref(item)] }) } : { label: "Delivery", go: openIt };
    if (item.status === "approved")
      return byHand && current(item) ? { label: "Mark scheduled", go: () => void run({ action: "mark_delivered", program_id: client.id, event: "scheduled", items: [ref(item)] }) } : { label: byHand ? "Review" : "Delivery", go: openIt };
    if (item.status === "client_review" && !officeLed) return { label: "With the client", go: openIt };
    if (officeLed && (item.status === "internal_review" || item.status === "client_review"))
      return readyToAuthorize(item) && !hasError(audit[item.id])
        ? { label: "Authorize", go: () => void run({ action: "authorize_piece", id: item.id, revision: item.review_revision ?? 1 }) }
        : { label: "Finish to authorize", go: openIt };
    return following ? { label: STATUS_LABEL[following], go: () => void run({ action: "update_item", id: item.id, patch: { status: following } }) } : null;
  }
  const stageLabel = (status: Status) => (officeLed && status === "client_review" ? "Ready to authorize" : STATUS_LABEL[status]);
  const accountOf = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const nameOf = useMemo(() => new Map(team.map((m) => [m.id, m.full_name])), [team]);
  const columns = useMemo(() => {
    const by = new Map<Status, Item[]>(STATUSES.map((s) => [s, []]));
    for (const item of visible) by.get(item.status)?.push(item);
    return by;
  }, [visible]);
  const editing = open ? items.find((i) => i.id === open) : undefined;

  return (
    <div className="space-y-4">
      {controls}
      {(officeLed || byHand) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white px-4 py-3 shadow-soft ring-1 ring-ink-100">
          <p className="min-w-0 flex-1 text-sm text-slate-600">
            <span className="font-semibold text-ink-900">{officeLed ? "We decide what to post for this client." : "The client approves posts."}</span>{" "}
            {byHand ? "Posts are scheduled by hand, so record them here." : "Posts go out through the connected publisher."}
          </p>
          {asking ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm">
              <span className="text-sm font-medium text-ink-900">{BULK.find((b) => b.key === asking)?.confirm(bulk[asking].length)}</span>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => runBulk(asking)}>Yes</button>
              <button type="button" className="btn-secondary" onClick={() => setAsking(null)}>Cancel</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {BULK.filter((b) => (b.key === "authorize" ? officeLed : byHand)).map((b) => (
                <button key={b.key} type="button" className="btn-secondary" disabled={busy || bulk[b.key].length === 0} onClick={() => { setDone(""); setAsking(b.key); }}>
                  <b.icon className="h-4 w-4" aria-hidden="true" /> {b.label(bulk[b.key].length)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <p role="status" className="min-h-5 text-sm">
        <span className="text-rose-700">{error}</span>
        {!error && <span className="text-emerald-700">{busy ? "Working..." : done}</span>}
      </p>
      <div className="grid grid-cols-1 gap-3 pb-4 md:grid-flow-col md:auto-cols-[minmax(15rem,1fr)] md:grid-cols-none md:overflow-x-auto">
        {STATUSES.map((status, index) => {
          const list = columns.get(status) ?? [];
          const next = STATUSES[index + 1];
          // With no client approval step, the column only shows if something is sitting in it.
          if (officeLed && status === "client_review" && list.length === 0) return null;
          return (
            <section key={status} aria-label={stageLabel(status)} className="flex min-h-40 flex-col rounded-xl bg-ink-50/70 ring-1 ring-ink-100">
              <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <span className={`h-2 w-2 rounded-full ${STATUS_BAR[status]}`} aria-hidden="true" />
                  {stageLabel(status)}
                </h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600 ring-1 ring-ink-100">{list.length}</span>
              </header>
              <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {list.map((item) => {
                  const late = isLate(item, today);
                  const who = item.assignee ? nameOf.get(item.assignee) : undefined;
                  const todo = step(item, officeLed && next === "client_review" ? undefined : next);
                  return (
                    <li key={item.id} className="card overflow-hidden">
                      <button type="button" onClick={() => setOpen(item.id)} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-ocean-600">
                        {item.creative_path && item.creative_type?.startsWith("image/") && (
                          // The saved image for this piece. Loaded only as the card scrolls into view.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={officeCreativeHref(item.id, item.review_revision ?? 1)} alt="" loading="lazy" decoding="async" className="h-28 w-full bg-ink-100 object-cover" />
                        )}
                        <div className="px-3 pt-3">
                        <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-wider text-ocean-700">
                          {accountOf.get(item.account_id)?.name ?? "Account"}
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm font-medium text-ink-900">
                          {item.title || `${KIND_LABEL[item.kind]}: ${PILLAR_LABEL[item.pillar]}`}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="pill bg-white ring-1 ring-ink-200">{KIND_LABEL[item.kind]}</span>
                          <span className={`inline-flex items-center gap-1 ${late ? "font-semibold text-rose-700" : ""}`}>
                            <CalendarDays className="h-3 w-3" aria-hidden="true" />
                            {shortDate(item.scheduled_for)}
                            {late && " (late)"}
                          </span>
                          {item.design_url && <Palette className="h-3 w-3 text-fuchsia-600" aria-label="Has a design" />}
                          {item.creative_path && item.creative_type?.startsWith("video/") && <Clapperboard className="h-3 w-3 text-ocean-600" aria-label="Has a video" />}
                          {audit[item.id] && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${hasError(audit[item.id]) ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
                              {audit[item.id].length} {audit[item.id].length === 1 ? "check" : "checks"}
                            </span>
                          )}
                        </div>
                        </div>
                      </button>
                      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-2">
                        <span
                          title={who ?? "Not assigned"}
                          className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${who ? "bg-ocean-100 text-ocean-800" : "bg-slate-100 text-slate-400"}`}
                        >
                          {who ? initials(who) : "?"}
                        </span>
                        {todo && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={todo.go}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-ocean-700 hover:bg-ocean-50 disabled:opacity-50"
                          >
                            {todo.label} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {list.length === 0 && <li className="px-2 py-6 text-center text-xs text-slate-400">Nothing here</li>}
              </ul>
            </section>
          );
        })}
      </div>
      {editing && (
        <ItemEditor
          key={editing.id}
          item={editing}
          accountName={accountOf.get(editing.account_id)?.name ?? "Account"}
          brandKitUrl={accountOf.get(editing.account_id)?.brand_kit_url}
          team={team}
          issues={audit[editing.id]}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
