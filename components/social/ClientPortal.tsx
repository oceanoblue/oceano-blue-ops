"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquarePlus, PencilLine } from "lucide-react";

const NAME_KEY = "oceano-social-name";

/** The name this person typed last time, kept in their browser so they type it once. */
function rememberedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
function rememberName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private browsing or storage switched off: they type it again next time.
  }
}

/** Send one request from a client page, then reload the page's content. */
function useClientAction(token: string, readOnly: boolean) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      if (readOnly) {
        setError("This is a preview. It works on the live page only.");
        return false;
      }
      setBusy(true);
      setError("");
      try {
        const res = await fetch(`/api/social-public/report/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || "That could not be saved. Please try again.");
        if (typeof body.name === "string") rememberName(body.name);
        router.refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "That could not be saved. Please try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router, token, readOnly],
  );
  return { send, busy, error };
}

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">Your name</span>
      <input className="input" required minLength={2} maxLength={120} autoComplete="name" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/**
 * What a client can do with one piece: approve it or ask for a change while
 * it is waiting for their review, or ask for a change afterwards.
 */
export function PieceActions({ token, itemId, canApprove, readOnly }: { token: string; itemId: string; canApprove: boolean; readOnly: boolean }) {
  const { send, busy, error } = useClientAction(token, readOnly);
  const [mode, setMode] = useState<"idle" | "approve" | "changes">("idle");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  function open(next: "approve" | "changes") {
    const known = name || rememberedName();
    setName(known);
    // With a name already on file, approving is one tap.
    if (next === "approve" && known.trim().length >= 2) return void send({ action: "approve", item_id: itemId, name: known.trim() });
    setMode(next);
  }

  if (mode === "idle")
    return (
      <div className="mt-2.5 print:hidden">
        <div className="flex flex-wrap gap-2">
          {canApprove && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => open("approve")}>
              <Check className="h-4 w-4" aria-hidden="true" /> {busy ? "Saving..." : "Approve"}
            </button>
          )}
          <button type="button" className={canApprove ? "btn-secondary" : "btn-ghost -ml-3"} disabled={busy} onClick={() => open("changes")}>
            <PencilLine className="h-4 w-4" aria-hidden="true" /> {canApprove ? "Ask for changes" : "Ask for a change"}
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      </div>
    );

  return (
    <form
      className="mt-3 space-y-3 rounded-xl bg-ink-50 p-4 ring-1 ring-ink-100 print:hidden"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await send(mode === "approve" ? { action: "approve", item_id: itemId, name: name.trim() } : { action: "request_changes", item_id: itemId, name: name.trim(), note: note.trim() });
        if (ok) {
          setMode("idle");
          setNote("");
        }
      }}
    >
      {mode === "changes" && (
        <label className="block">
          <span className="label">What should we change?</span>
          <textarea className="input min-h-24" required minLength={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: use the pool photo instead, and mention the 4 pm start." />
        </label>
      )}
      <NameField value={name} onChange={setName} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Sending..." : mode === "approve" ? "Approve" : "Send to Oceano Blue Media"}
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => setMode("idle")}>
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>
  );
}

/** Approve every piece waiting for review for one account, in the month on screen. */
export function ApproveAll({ token, accountId, month, count, readOnly }: { token: string; accountId: string; month: string; count: number; readOnly: boolean }) {
  const { send, busy, error } = useClientAction(token, readOnly);
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState("");
  if (!asking)
    return (
      <div className="print:hidden">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setName(rememberedName());
            setAsking(true);
          }}
        >
          <Check className="h-4 w-4" aria-hidden="true" /> Approve all {count}
        </button>
      </div>
    );
  return (
    <form
      className="w-full space-y-3 rounded-xl bg-ink-50 p-4 ring-1 ring-ink-100 print:hidden"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ action: "approve_all", account_id: accountId, month, name: name.trim() })) setAsking(false);
      }}
    >
      <p className="text-sm text-slate-700">This approves all {count} pieces waiting for your review for this account this month.</p>
      <NameField value={name} onChange={setName} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Approving..." : `Approve all ${count}`}</button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>
  );
}

/** Send the team a note: an event coming up, a promotion, a correction, a question. */
export function NoteForm({ token, accounts, readOnly }: { token: string; accounts: { id: string; name: string }[]; readOnly: boolean }) {
  const { send, busy, error } = useClientAction(token, readOnly);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [message, setMessage] = useState("");

  if (!open)
    return (
      <div className="print:hidden">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setName(rememberedName());
            setSent(false);
            setOpen(true);
          }}
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" /> Send us a note
        </button>
        {sent && (
          <p role="status" className="mt-2 text-sm font-medium text-emerald-700">
            Thank you. Your note is with our team.
          </p>
        )}
      </div>
    );
  return (
    <form
      className="space-y-3 print:hidden"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ action: "note", account_id: account || null, name: name.trim(), message: message.trim() })) {
          setMessage("");
          setSent(true);
          setOpen(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Which account is it about?</span>
          <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All of them, or not sure</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <NameField value={name} onChange={setName} />
      </div>
      <label className="block">
        <span className="label">Your note</span>
        <textarea className="input min-h-28" required minLength={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="For example: live music on the patio every Friday in March, starting at 6 pm." />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Sending..." : "Send note"}</button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>
  );
}
