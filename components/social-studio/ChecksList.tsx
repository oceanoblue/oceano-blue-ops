"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CircleAlert } from "lucide-react";
import { type Issue, pieceLabel } from "@/lib/social/audit";
import { PILLAR_LABEL, STATUS_LABEL, STATUS_PILL, shortDate } from "@/lib/social/schema";
import type { Account, Item, Member } from "@/lib/social/server";
import { ItemEditor } from "./ItemEditor";

/** Every piece with a failed check, grouped by account, errors first. */
export function ChecksList({ items, accounts, team, audit }: { items: Item[]; accounts: Account[]; team: Member[]; audit: Record<string, Issue[]> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const accountOf = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const groups = useMemo(() => {
    const flagged = items
      .filter((i) => audit[i.id] && (!errorsOnly || audit[i.id].some((x) => x.severity === "error")))
      .map((item) => ({ item, issues: errorsOnly ? audit[item.id].filter((x) => x.severity === "error") : audit[item.id] }));
    const by = new Map<string, typeof flagged>();
    for (const row of flagged) by.set(row.item.account_id, [...(by.get(row.item.account_id) ?? []), row]);
    const errors = (rows: typeof flagged) => rows.reduce((n, r) => n + r.issues.filter((x) => x.severity === "error").length, 0);
    return [...by.entries()]
      .map(([id, rows]) => ({ id, name: accountOf.get(id)?.name ?? "Account", rows, errors: errors(rows) }))
      .sort((a, b) => b.errors - a.errors || a.name.localeCompare(b.name));
  }, [items, audit, errorsOnly, accountOf]);
  const editing = open ? items.find((i) => i.id === open) : undefined;

  return (
    <div className="space-y-4">
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
        Show only what must be fixed
      </label>
      {groups.map((group) => (
        <section key={group.id} className="card overflow-hidden">
          <header className="flex items-baseline justify-between gap-3 border-b border-ink-100 px-5 py-3">
            <h2 className="font-display text-lg font-semibold text-ocean-950">{group.name}</h2>
            <span className="text-sm text-slate-500">
              {group.rows.length} {group.rows.length === 1 ? "piece" : "pieces"}
            </span>
          </header>
          <ul className="divide-y divide-ink-100">
            {group.rows.map(({ item, issues }) => (
              <li key={item.id}>
                <button type="button" onClick={() => setOpen(item.id)} className="grid w-full gap-2 px-5 py-3 text-left hover:bg-ink-50/70 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-900">{item.title || `${pieceLabel(item)}: ${PILLAR_LABEL[item.pillar]}`}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className={`pill ${STATUS_PILL[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                      {pieceLabel(item)} · {shortDate(item.scheduled_for)}
                    </span>
                  </span>
                  <span className="space-y-1">
                    {issues.map((issue) => (
                      <span key={issue.code} className={`flex items-start gap-1.5 text-sm ${issue.severity === "error" ? "text-rose-700" : "text-amber-800"}`}>
                        {issue.severity === "error" ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Must fix" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Worth checking" />}
                        {issue.message}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length === 0 && <p className="card p-8 text-center text-sm text-slate-500">Nothing to fix{errorsOnly ? "" : " or check"} right now.</p>}
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
