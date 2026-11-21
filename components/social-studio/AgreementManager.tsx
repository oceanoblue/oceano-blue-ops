"use client";

import { useState } from "react";
import { ExternalLink, FilePlus2, PenLine, Send } from "lucide-react";
import { agreementPlaceholderCount } from "@/lib/social/schema";
import { agreementHref } from "@/lib/social/links";
import { AGREEMENT_LABEL, AGREEMENT_PILL, COUNTERSIGN_CONSENT } from "@/lib/social/schema";
import type { Agreement, Program } from "@/lib/social/server";
import { CopyButton } from "./ProgramSetup";
import { useSocialAction } from "./useSocialAction";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }) : "";

/** Write or edit an agreement while it is still a draft. */
function DraftForm({ programId, draft, onDone }: { programId: string; draft?: Agreement; onDone: () => void }) {
  const { run, busy, error } = useSocialAction();
  const [title, setTitle] = useState(draft?.title ?? "Social Media Management Agreement");
  const [body, setBody] = useState(draft?.body ?? "");
  const open = agreementPlaceholderCount(title, body);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = draft
          ? await run({ action: "update_agreement", id: draft.id, title, body })
          : await run({ action: "create_agreement", program_id: programId, title, body });
        if (ok) onDone();
      }}
    >
      <label className="block">
        <span className="label">Title</span>
        <input className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">Agreement text</span>
        <textarea className="input min-h-96 font-mono text-xs leading-relaxed" required maxLength={120000} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <p className="text-xs text-slate-500">
        Paste the full text. Start a line with &quot;# &quot; for a main heading or &quot;## &quot; for a section heading; leave a blank line between paragraphs.
        {open > 0 && <span className="font-semibold text-amber-700"> {open} item{open === 1 ? "" : "s"} in [square brackets] still to fill in.</span>}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? "Saving..." : "Save draft"}</button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={onDone}>Cancel</button>
        <p role="alert" className="text-sm text-rose-700">{error}</p>
      </div>
    </form>
  );
}

function AgreementCard({ agreement, origin }: { agreement: Agreement; origin: string }) {
  const { run, busy, error } = useSocialAction();
  const [mode, setMode] = useState<"view" | "edit" | "send" | "void" | "sign">("view");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  const url = agreement.token ? `${origin}${agreementHref(agreement.token)}` : "";
  const open = agreementPlaceholderCount(agreement.title, agreement.body);

  if (mode === "edit")
    return (
      <li className="p-5">
        <DraftForm programId={agreement.program_id} draft={agreement} onDone={() => setMode("view")} />
      </li>
    );

  return (
    <li className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-ink-900">{agreement.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {agreement.status === "draft" && `Draft, last saved ${when(agreement.updated_at)}`}
            {agreement.status === "sent" && `Sent ${when(agreement.sent_at)}`}
            {agreement.status === "client_signed" && `Signed by ${agreement.client_name}${agreement.client_title ? `, ${agreement.client_title}` : ""} on ${when(agreement.client_signed_at)}`}
            {agreement.status === "signed" &&
              `Signed by ${agreement.client_name} on ${when(agreement.client_signed_at)} and by ${agreement.counter_name} on ${when(agreement.countersigned_at)}`}
            {agreement.status === "void" && `Cancelled ${when(agreement.updated_at)}`}
          </p>
        </div>
        <span className={`pill ${AGREEMENT_PILL[agreement.status]}`}>{AGREEMENT_LABEL[agreement.status]}</span>
      </div>

      {agreement.status === "draft" && mode === "view" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => setMode("edit")}>
            <PenLine className="h-4 w-4" aria-hidden="true" /> Edit
          </button>
          <button type="button" className="btn-primary" disabled={open > 0} onClick={() => setMode("send")}>
            <Send className="h-4 w-4" aria-hidden="true" /> Get the signing link
          </button>
          <button type="button" className="btn-ghost" onClick={() => setMode("void")}>Cancel this draft</button>
          {open > 0 && <span className="text-sm font-medium text-amber-700">{open} item{open === 1 ? "" : "s"} in [square brackets] still to fill in</span>}
        </div>
      )}

      {mode === "send" && (
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p>
            This locks the text and creates a private link for the client to read and sign. Nothing is emailed: you send the link yourself.
            {open > 0 && <strong> The text still has {open} item{open === 1 ? "" : "s"} in [square brackets].</strong>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy || open > 0} onClick={async () => (await run({ action: "send_agreement", id: agreement.id })) && setMode("view")}>
              {busy ? "Working..." : "Lock the text and create the link"}
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setMode("view")}>Not yet</button>
          </div>
        </div>
      )}

      {mode === "void" && (
        <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          <p>Cancel this agreement? Its link stops working and any signature on it is set aside. This cannot be undone.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={async () => (await run({ action: "void_agreement", id: agreement.id })) && setMode("view")}>
              {busy ? "Working..." : "Yes, cancel it"}
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setMode("view")}>Keep it</button>
          </div>
        </div>
      )}

      {url && agreement.status !== "void" && mode === "view" && (
        <div className="space-y-2">
          <input className="input font-mono text-xs" readOnly value={url} aria-label="Signing link" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={url} label="Copy link" className={agreement.status === "sent" ? "btn-primary" : "btn-secondary"} />
            <a className="btn-secondary" href={agreementHref(agreement.token!)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> {agreement.status === "signed" ? "Open the signed copy" : "Open as the client"}
            </a>
            {agreement.status === "client_signed" && (
              <button type="button" className="btn-primary" onClick={() => setMode("sign")}>
                <PenLine className="h-4 w-4" aria-hidden="true" /> Countersign
              </button>
            )}
            {agreement.status !== "signed" && (
              <button type="button" className="btn-ghost" onClick={() => setMode("void")}>Cancel agreement</button>
            )}
          </div>
        </div>
      )}

      {mode === "sign" && (
        <form
          className="space-y-3 rounded-lg bg-ink-50 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run({ action: "countersign_agreement", id: agreement.id, signer_name: name, signer_title: title, consent: true })) setMode("view");
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Your full name</span>
              <input className="input" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label>
              <span className="label">Your title</span>
              <input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example Founder" />
            </label>
          </div>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>{COUNTERSIGN_CONSENT}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy || !consent}>{busy ? "Signing..." : "Sign for Oceano Blue Media"}</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setMode("view")}>Not yet</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </li>
  );
}

/** A client's agreements: write a draft, send it for signature, countersign it, keep the signed copy. */
export function AgreementManager({ program, agreements, origin }: { program: Pick<Program, "id" | "name">; agreements: Agreement[]; origin: string }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ocean-950">Agreements</h2>
          <p className="mt-0.5 max-w-prose text-sm text-slate-600">
            Write the agreement, send {program.name} a private link to sign it, then countersign. The signed copy stays here and at the same link.
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" /> New agreement
          </button>
        )}
      </header>
      {adding && (
        <div className="border-b border-ink-100 p-5">
          <DraftForm programId={program.id} onDone={() => setAdding(false)} />
        </div>
      )}
      {agreements.length === 0 && !adding ? (
        <p className="p-5 text-sm text-slate-600">No agreement yet. Start one with &quot;New agreement&quot;.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {agreements.map((a) => (
            <AgreementCard key={`${a.id}-${a.status}-${a.updated_at}`} agreement={a} origin={origin} />
          ))}
        </ul>
      )}
    </section>
  );
}
