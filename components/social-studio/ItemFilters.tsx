"use client";

import { useEffect, useMemo, useState } from "react";
import { STATUSES, STATUS_LABEL } from "@/lib/social/schema";
import { hasError, type Issue } from "@/lib/social/audit";
import type { Account, Item, Member } from "@/lib/social/server";

/** Account and assignee filters shared by the board and the calendar. */
export function useItemFilters(items: Item[], accounts: Account[], team: Member[], audit: Record<string,Issue[]> = {}) {
  const [account, setAccount] = useState("");
  const [assignee, setAssignee] = useState("");
  const [stage,setStage]=useState("");
  const [blocked,setBlocked]=useState(false);
  const [search,setSearch]=useState("");
  const key="social-filters:"+ (accounts[0]?.program_id || "empty");
  useEffect(()=>{
    try{
      const saved=JSON.parse(sessionStorage.getItem(key)||"{}");
      setAccount(accounts.some(a=>a.id===saved.account)?saved.account:"");
      setAssignee(saved.assignee==="none"||team.some(m=>m.id===saved.assignee)?saved.assignee:"");
      setStage(STATUSES.some(stage=>stage===saved.stage)?saved.stage:"");
      setBlocked(saved.blocked===true);setSearch(typeof saved.search==="string"?saved.search:"");
    }catch{ /* Filtering is still available if storage is disabled. */ }
  },[key,accounts,team]);
  function remember(){try{sessionStorage.setItem(key,JSON.stringify({account,assignee,stage,blocked,search}));}catch{}}
  function clear(){setAccount("");setAssignee("");setStage("");setBlocked(false);setSearch("");try{sessionStorage.removeItem(key);}catch{}}
  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (!stage || i.status===stage) &&
          (!blocked || hasError(audit[i.id]) || i.client_decision==="changes") &&
          (!search || (i.title+" "+(accounts.find(a=>a.id===i.account_id)?.name || "")).toLowerCase().includes(search.trim().toLowerCase())) &&
          (!account || i.account_id === account) &&
          (!assignee || (assignee === "none" ? !i.assignee : i.assignee === assignee)),
      ),
    [items, account, assignee, stage, blocked, search, audit, accounts],
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
      <input className="input w-auto" type="search" value={search} aria-label="Search titles or properties" placeholder="Title or property" onChange={e=>setSearch(e.target.value)}/>
      <select className="input w-auto" aria-label="Production stage" value={stage} onChange={e=>setStage(e.target.value)}><option value="">All stages</option>{STATUSES.map(s=><option value={s} key={s}>{STATUS_LABEL[s]}</option>)}</select>
      <label className="text-sm"><input type="checkbox" checked={blocked} onChange={e=>setBlocked(e.target.checked)}/> Blocked or changes requested</label>
      <button type="button" className="btn-ghost" onClick={remember}>Remember filters</button>
      <button type="button" className="btn-ghost" onClick={clear}>Reset</button>
      <span className="text-sm text-slate-500">
        {visible.length.toLocaleString()} {visible.length === 1 ? "piece" : "pieces"}
      </span>
    </div>
  );
  return { visible, controls };
}
