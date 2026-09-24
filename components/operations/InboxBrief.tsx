"use client";
import { useState } from "react";
import { ArrowUpRight, Mail, PenLine } from "lucide-react";
import { replyDraft } from "@/lib/operations/actions";
import type { EmailDraft, InboxSnapshot } from "@/lib/operations/types";
import { fmtDate } from "@/lib/utils/format";

export function InboxBrief({ inbox, timezone, onDraft }: { inbox?: InboxSnapshot; timezone: string; onDraft: (draft: EmailDraft) => void }) {
  const [expanded, setExpanded] = useState(false);
  const messages = expanded ? inbox?.messages : inbox?.messages.slice(0, 5);
  return <section id="inbox" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[.17em] text-ocean-700">Conversations to review</p><h2 className="mt-2 flex items-center gap-2 text-xl font-semibold"><Mail className="h-5 w-5 text-ocean-700"/>From your inbox</h2></div><a href="/dashboard/settings/integrations" className="text-sm font-medium text-ocean-700">{inbox?.status === "connected" ? inbox.account || "Manage Gmail" : "Connect Gmail"}<span aria-hidden> ↗</span></a></div>
    <p className={`mt-3 text-sm ${inbox?.status === "error" ? "text-amber-800" : "text-slate-500"}`}>{inbox?.message || "Connect Gmail to bring email context into your morning brief."}</p>
    {!inbox?.messages.length ? <div className="mt-5 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">{inbox?.status === "connected" ? "No messages matched this inbox window. Older and archived conversations are not included." : "Email context is unavailable. Calendar and production work are shown separately."}</div> :
      <div className="mt-4 divide-y divide-slate-100">{(messages ?? []).map((message,index) => <article key={message.id} className="flex gap-4 py-5"><span className="pt-0.5 text-sm tabular-nums text-slate-400">{String(index+1).padStart(2,"0")}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span className="break-all">{message.from}</span>{message.receivedAt && <span>{fmtDate(message.receivedAt,timezone)}</span>}{message.unread && <span className="rounded-full bg-ocean-50 px-2 py-0.5 text-ocean-700">Unread</span>}</div><h3 className="mt-1 break-words font-semibold text-ink-950"><a href={message.href} target="_blank" rel="noopener noreferrer" className="hover:underline">{message.subject}</a></h3><p className="mt-2 break-words text-sm leading-relaxed text-slate-600">{message.snippet || "Preview unavailable. Open the message to read it."}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onDraft(replyDraft(message))} className="btn-secondary min-h-10 text-sm"><PenLine className="h-4 w-4"/>Draft reply</button><a href={message.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 px-3 text-sm text-ocean-700">Read conversation<ArrowUpRight className="h-4 w-4"/></a></div></div></article>)}</div>}
    {(inbox?.messages.length ?? 0) > 5 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="mt-3 min-h-10 text-sm font-medium text-ocean-700">{expanded ? "Show fewer conversations" : `View all ${inbox?.messages.length} conversations`}</button>}
  </section>;
}
