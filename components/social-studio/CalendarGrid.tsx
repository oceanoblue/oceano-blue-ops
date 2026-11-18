"use client";

import { useMemo, useState } from "react";
import {
  KIND_LABEL,
  STATUSES,
  STATUS_BAR,
  STATUS_LABEL,
  STATUS_PILL,
  daysInMonth,
  isLate,
  shortDate,
} from "@/lib/social/schema";
import type { Account, Item, Member } from "@/lib/social/server";
import { ItemEditor } from "./ItemEditor";
import { useItemFilters } from "./ItemFilters";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PER_DAY = 4;

/** The month's pieces laid out by publish date. */
export function CalendarGrid({
  month,
  items,
  accounts,
  team,
  today,
}: {
  month: string;
  items: Item[];
  accounts: Account[];
  team: Member[];
  today: string;
}) {
  const { visible, controls } = useItemFilters(items, accounts, team);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const accountOf = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of visible) {
      const key = item.scheduled_for?.startsWith(month) ? item.scheduled_for : "none";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [visible, month]);

  const [year, monthNumber] = month.split("-").map(Number);
  const lead = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const editing = open ? items.find((i) => i.id === open) : undefined;
  const unscheduled = byDay.get("none") ?? [];

  const chip = (item: Item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setOpen(item.id)}
      title={`${accountOf.get(item.account_id)?.name ?? ""}: ${STATUS_LABEL[item.status]}`}
      className={`flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium ${STATUS_PILL[item.status]} ${
        isLate(item, today) ? "ring-1 ring-rose-400" : ""
      } hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ocean-600`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_BAR[item.status]}`} aria-hidden="true" />
      <span className="truncate">
        {accountOf.get(item.account_id)?.name ?? "Account"}
        <span className="opacity-70"> · {KIND_LABEL[item.kind]}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {controls}
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600" aria-label="Stage colors">
          {STATUSES.map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS_BAR[s]}`} aria-hidden="true" />
              {STATUS_LABEL[s]}
            </li>
          ))}
        </ul>
      </div>

      {/* Month grid on wider screens */}
      <div className="card hidden overflow-hidden md:block">
        <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50/70">
          {WEEKDAYS.map((d) => (
            <div key={d} className="table-head px-2 py-2 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: lead }, (_, i) => (
            <div key={`lead-${i}`} className="min-h-28 border-b border-r border-ink-100 bg-ink-50/40" />
          ))}
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const all = expanded === day;
            return (
              <div key={day} className={`min-h-28 border-b border-r border-ink-100 p-1.5 ${day === today ? "bg-ocean-50/60" : ""}`}>
                <div className={`mb-1 px-1 text-xs font-semibold tabular-nums ${day === today ? "text-ocean-700" : "text-slate-500"}`}>
                  {Number(day.slice(8))}
                </div>
                <div className="space-y-1">
                  {(all ? list : list.slice(0, PER_DAY)).map(chip)}
                  {list.length > PER_DAY && (
                    <button type="button" onClick={() => setExpanded(all ? null : day)} className="px-1.5 text-[11px] font-medium text-ocean-700 hover:underline">
                      {all ? "Show fewer" : `+${list.length - PER_DAY} more`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {Array.from({ length: (7 - ((lead + days.length) % 7)) % 7 }, (_, i) => (
            <div key={`tail-${i}`} className="min-h-28 border-b border-r border-ink-100 bg-ink-50/40" />
          ))}
        </div>
      </div>

      {/* Day-by-day list on phones */}
      <div className="space-y-3 md:hidden">
        {days.filter((d) => byDay.has(d)).map((day) => (
          <section key={day} className="card p-3">
            <h2 className="mb-2 text-sm font-semibold text-ink-900">{shortDate(day)}</h2>
            <div className="space-y-1">{(byDay.get(day) ?? []).map(chip)}</div>
          </section>
        ))}
        {visible.length === 0 && <p className="card p-6 text-center text-sm text-slate-500">No pieces match these filters.</p>}
      </div>

      {unscheduled.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-900">No publish date in this month ({unscheduled.length})</h2>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">{unscheduled.map(chip)}</div>
        </section>
      )}

      {editing && (
        <ItemEditor
          key={editing.id}
          item={editing}
          accountName={accountOf.get(editing.account_id)?.name ?? "Account"}
          brandKitUrl={accountOf.get(editing.account_id)?.brand_kit_url}
          team={team}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
