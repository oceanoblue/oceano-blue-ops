"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Copy, Plus } from "lucide-react";
import { clientHref } from "@/lib/social/links";
import {
  PROGRAM_STATUSES,
  TIERS,
  TIER_DEFAULTS,
  TIER_LABEL,
  monthLabel,
  parseAccountLines,
  type Tier,
} from "@/lib/social/schema";
import type { Program } from "@/lib/social/server";
import { useSocialAction } from "./useSocialAction";

const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Add a new social media client. Opens the client's dashboard once it is created. */
export function NewProgramForm() {
  const router = useRouter();
  const { run, busy, error } = useSocialAction();
  const [form, setForm] = useState({ name: "", contact_name: "", contact_email: "", publishing_tool: "" });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await run({ action: "create_program", ...form });
        if (result && typeof result.id === "string") router.push(clientHref("dashboard", result.id));
      }}
    >
      <label className="sm:col-span-2">
        <span className="label">Client name</span>
        <input className="input" required maxLength={160} value={form.name} onChange={set("name")} placeholder="For example a hotel group or a restaurant" />
      </label>
      <label>
        <span className="label">Client contact</span>
        <input className="input" maxLength={160} value={form.contact_name} onChange={set("contact_name")} />
      </label>
      <label>
        <span className="label">Contact email</span>
        <input type="email" className="input" maxLength={254} value={form.contact_email} onChange={set("contact_email")} />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Publishing tool</span>
        <input className="input" maxLength={80} value={form.publishing_tool} onChange={set("publishing_tool")} placeholder="For example Statusbrew or Meta Business Suite" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {busy ? "Adding..." : "Add client"}
        </button>
        <p role="alert" className="text-sm text-rose-700">{error}</p>
      </div>
    </form>
  );
}

/** Put the month's pieces on the plan and set where the client stands. */
export function PlanMonth({ program, month, accountCount, planned, owed }: { program: Program; month: string; accountCount: number; planned: number; owed: number }) {
  const { run, busy, error } = useSocialAction();
  const [message, setMessage] = useState("");
  const missing = Math.max(0, owed - planned);

  async function plan() {
    setMessage("");
    const result = await run({ action: "plan_month", program_id: program.id, month });
    if (result) setMessage(Number(result.created) > 0 ? `Added ${result.created} pieces to ${monthLabel(month)}.` : `${monthLabel(month)} is already fully planned.`);
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-ocean-950">Plan {monthLabel(month)}</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {accountCount === 0
              ? "Add sub-accounts first, then plan the month."
              : missing > 0
                ? `${missing} of ${owed} pieces are not on the plan yet. Planning adds only what is missing and never changes existing work.`
                : `All ${owed} pieces are on the plan.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Client status
            <select className="input w-auto" value={program.status} disabled={busy} onChange={(e) => run({ action: "update_program", id: program.id, patch: { status: e.target.value } })}>
              {PROGRAM_STATUSES.map((s) => (
                <option key={s} value={s}>{humanize(s)}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-primary" disabled={busy || accountCount === 0 || missing === 0} onClick={plan}>
            <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Plan the month
          </button>
        </div>
      </div>
      {(message || error) && (
        <p role="status" className={`border-t border-ink-100 px-5 py-3 text-sm ${error ? "text-rose-700" : "text-emerald-700"}`}>{error || message}</p>
      )}
    </section>
  );
}

/** Add hotels, outlets or brand pages to a client, one per line. */
export function AddAccounts({ program, open = false }: { program: Program; open?: boolean }) {
  const { run, busy, error } = useSocialAction();
  const [message, setMessage] = useState("");
  const [tier, setTier] = useState<Tier>("standard");
  const [lines, setLines] = useState("");
  const parsed = parseAccountLines(lines);
  const defaults = TIER_DEFAULTS[tier];

  async function addAccounts(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const result = await run({ action: "add_accounts", program_id: program.id, tier, accounts: parsed });
    if (!result) return;
    setLines("");
    setMessage(`Added ${result.added} ${result.added === 1 ? "sub-account" : "sub-accounts"}${Number(result.skipped) > 0 ? `; ${result.skipped} already existed` : ""}.`);
  }

  return (
    <section className="card">
      <details className="group p-5" open={open}>
        <summary className="cursor-pointer text-sm font-semibold text-ocean-800">Add sub-accounts to {program.name}</summary>
        <form onSubmit={addAccounts} className="mt-4 grid gap-4 lg:grid-cols-[14rem_1fr]">
          <div>
            <label>
              <span className="label">Type of sub-account</span>
              <select className="input" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
                {TIERS.map((t) => (
                  <option key={t} value={t}>{TIER_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Starts at {defaults.posts_per_month} posts, {defaults.reels_per_month} {defaults.reels_per_month === 1 ? "reel" : "reels"}
              {defaults.google_posts_per_month > 0 ? ` and ${defaults.google_posts_per_month} Google posts` : ""} a month. You can change the numbers on each sub-account.
            </p>
          </div>
          <div>
            <label>
              <span className="label">Sub-accounts, one per line</span>
              <textarea
                className="input min-h-32 font-mono text-xs"
                value={lines}
                onChange={(e) => setLines(e.target.value)}
                placeholder={"Hampton Inn Example City\nExample Beach Bar | https://www.facebook.com/... | https://www.instagram.com/... | https://www.canva.com/brand/..."}
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Paste profile links and a Canva brand kit link after a name and they are saved with it. {parsed.length > 0 && `${parsed.length} ready to add.`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn-secondary" disabled={busy || parsed.length === 0 || parsed.length > 60}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add {parsed.length || ""} {parsed.length === 1 ? "sub-account" : "sub-accounts"}
              </button>
              {(message || error) && (
                <p role="status" className={`text-sm ${error ? "text-rose-700" : "text-emerald-700"}`}>{error || message}</p>
              )}
            </div>
          </div>
        </form>
      </details>
    </section>
  );
}

/** Copy a piece of text, with a short "Copied" confirmation. */
export function CopyButton({ text, label, className = "btn-secondary" }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked; nothing to do.
        }
      }}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

/** Copy a ready-to-send list of the media we need from the client. */
export function CopyMediaAsk({ text }: { text: string }) {
  return <CopyButton text={text} label="Copy media request" />;
}
