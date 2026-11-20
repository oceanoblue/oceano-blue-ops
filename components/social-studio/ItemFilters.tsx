"use client";

import { useMemo, useState } from "react";
import type { Account, Item, Member } from "@/lib/social/server";

/** Account and assignee filters shared by the board and the calendar. */
export function useItemFilters(items: Item[], accounts: Account[], team: Member[]) {
  const [account, setAccount] = useState("");
  const [assignee, setAssignee] = useState("");
  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (!account || i.account_id === account) &&
          (!assignee || (assignee === "none" ? !i.assignee : i.assignee === assignee)),
      ),
    [items, account, assignee],
  );
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input w-auto min-w-52" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Filter by account">
        <option value="">All sub-accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <select className="input w-auto min-w-44" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Filter by team member">
        <option value="">Everyone</option>
        <option value="none">Not assigned</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>{m.full_name}</option>
        ))}
      </select>
      <span className="text-sm text-slate-500">
        {visible.length.toLocaleString()} {visible.length === 1 ? "piece" : "pieces"}
      </span>
    </div>
  );
  return { visible, controls };
}
