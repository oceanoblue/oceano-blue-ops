"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Palette } from "lucide-react";
import {
  KIND_LABEL,
  PILLAR_LABEL,
  STATUSES,
  STATUS_BAR,
  STATUS_LABEL,
  isLate,
  shortDate,
  type Status,
} from "@/lib/social/schema";
import type { Account, Item, Member } from "@/lib/social/server";
import { hasError, type Issue } from "@/lib/social/audit";
import { ItemEditor } from "./ItemEditor";
import { useItemFilters } from "./ItemFilters";
import { useSocialAction } from "./useSocialAction";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** The month's pieces as columns, one per production stage. */
export function Board({ initialItem, items, accounts, team, today, audit = {} }: { initialItem?: string; items: Item[]; accounts: Account[]; team: Member[]; today: string; audit?: Record<string, Issue[]> }) {
  const { visible, controls } = useItemFilters(items, accounts, team, audit);
  const [open, setOpen] = useState<string | null>(initialItem ?? null);
  const { run, busy, error } = useSocialAction();
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
      <p role="alert" className="min-h-5 text-sm text-rose-700">{error}</p>
      <div className="grid grid-cols-1 gap-3 pb-4 md:grid-flow-col md:auto-cols-[minmax(15rem,1fr)] md:grid-cols-none md:overflow-x-auto">
        {STATUSES.map((status, index) => {
          const list = columns.get(status) ?? [];
          const next = STATUSES[index + 1];
          return (
            <section key={status} aria-label={STATUS_LABEL[status]} className="flex min-h-40 flex-col rounded-xl bg-ink-50/70 ring-1 ring-ink-100">
              <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <span className={`h-2 w-2 rounded-full ${STATUS_BAR[status]}`} aria-hidden="true" />
                  {STATUS_LABEL[status]}
                </h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600 ring-1 ring-ink-100">{list.length}</span>
              </header>
              <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {list.map((item) => {
                  const late = isLate(item, today);
                  const who = item.assignee ? nameOf.get(item.assignee) : undefined;
                  return (
                    <li key={item.id} className="card overflow-hidden">
                      <button type="button" onClick={() => setOpen(item.id)} className="block w-full px-3 pt-3 text-left focus-visible:outline-2 focus-visible:outline-ocean-600">
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
                          {audit[item.id] && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${hasError(audit[item.id]) ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
                              {audit[item.id].length} {audit[item.id].length === 1 ? "check" : "checks"}
                            </span>
                          )}
                        </div>
                      </button>
                      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-2">
                        <span
                          title={who ?? "Not assigned"}
                          className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${who ? "bg-ocean-100 text-ocean-800" : "bg-slate-100 text-slate-400"}`}
                        >
                          {who ? initials(who) : "?"}
                        </span>
                        {next && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => ["approved", "scheduled", "published"].includes(next) ? setOpen(item.id) : run({ action: "update_item", id: item.id, patch: { status: next } })}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-ocean-700 hover:bg-ocean-50 disabled:opacity-50"
                          >
                            {["approved", "scheduled", "published"].includes(next) ? "Review & delivery" : STATUS_LABEL[next]} <ArrowRight className="h-3 w-3" aria-hidden="true" />
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
