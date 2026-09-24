"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Loader2, Save, Sparkles, X } from "lucide-react";
import type { EmailDraft } from "@/lib/operations/types";

export function DraftDialog({ initial, canSave, onClose }: { initial: EmailDraft; canSave: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(initial);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<{ id: string; href: string } | null>(null);
  const [dirty, setDirty] = useState(true);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  async function execute(action: "generate" | "save") {
    setBusy(action); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/operations/draft?action=${action}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "generate" ? { sourceId: draft.sourceId, instruction } : { ...draft, ...(saved ? { draftId: saved.id } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft could not be prepared.");
      if (action === "generate") {
        setDraft(prev => ({ ...prev, body: data.body })); setDirty(true);
        setNotice(`Drafted with ${data.provider === "openai" ? "OpenAI" : "Claude"} · ${data.model}. Review against the full conversation.`);
      } else {
        setSaved(data.draft); setDirty(false);
        setNotice("Saved to Gmail. Open Gmail to review and send. The production status has not changed.");
      }
    } catch (e) {
      setError((e instanceof Error ? e.message : "Draft unavailable.") + (action === "save" ? " If the request timed out, check Gmail Drafts before retrying." : ""));
    } finally { setBusy(""); }
  }
  function change(key: keyof EmailDraft, value: string) { setDraft(prev => ({ ...prev, [key]: value })); setDirty(true); }
  async function copy() {
    try { await navigator.clipboard.writeText(`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`); setNotice("Draft copied."); }
    catch { setError("Select and copy the draft text manually."); }
  }
  return <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); }} onClose={onClose}
    aria-labelledby="draft-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
      <div><p className="text-xs uppercase tracking-[.18em] text-ocean-700">Your next move</p><h2 id="draft-title" className="mt-1 text-xl font-semibold">{draft.sourceId ? "Draft a reply" : "Prepare editor handoff"}</h2></div>
      <button type="button" aria-label="Close draft" disabled={!!busy} onClick={() => dialog.current?.close()} className="rounded-lg p-3 hover:bg-slate-100 disabled:opacity-40"><X className="h-5 w-5"/></button>
    </div>
    <form className="space-y-4 p-6" onSubmit={event => { event.preventDefault(); void execute("save"); }}>
      <label className="block text-sm font-medium">To<input autoFocus required type="email" maxLength={254} value={draft.to} disabled={!!busy} onChange={e => change("to", e.target.value)} className="input mt-1 w-full" placeholder="Choose the recipient’s email"/></label>
      <label className="block text-sm font-medium">Subject<input required maxLength={250} value={draft.subject} disabled={!!busy} onChange={e => change("subject", e.target.value)} className="input mt-1 w-full"/></label>
      {draft.sourceId && <div className="rounded-xl bg-[#f7f7f2] p-4">
        <label className="block text-sm font-medium">What would you like to say?<textarea maxLength={1200} value={instruction} disabled={!!busy} onChange={e => setInstruction(e.target.value)} className="input mt-2 w-full" rows={2} placeholder="e.g. Ask them to confirm the revised shoot time."/></label>
        <button type="button" disabled={!!busy} onClick={() => void execute("generate")} className="btn-secondary mt-2 min-h-10 disabled:opacity-50">{busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}Draft with my assistant</button>
        <p className="mt-2 text-xs text-slate-500">Uses your day-planner model and the email preview. Review the full thread before sending.</p>
      </div>}
      <label className="block text-sm font-medium">Message<textarea required maxLength={12000} rows={11} value={draft.body} disabled={!!busy} onChange={e => change("body", e.target.value)} className="input mt-1 w-full text-sm leading-relaxed"/></label>
      {!draft.sourceId && <p className="text-xs text-slate-500">Add media links the editor can access. An internal workspace link alone does not grant access.</p>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-ocean-800">{notice}</p>}
      {!canSave && <p className="text-sm text-amber-800"><a href="/dashboard/settings/integrations" className="underline">Enable Gmail draft saving</a> to save directly to your mailbox. You can copy this draft now.</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={() => void copy()} className="btn-secondary"><Copy className="h-4 w-4"/>Copy</button>
        {saved && !dirty && <a href={saved.href} target="_blank" rel="noopener noreferrer" className="btn-primary">Open Gmail to send<ExternalLink className="h-4 w-4"/></a>}
        <button type="submit" disabled={!!busy || !canSave || !dirty} className="btn-primary disabled:opacity-40">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}{saved ? "Update Gmail draft" : "Save Gmail draft"}</button>
      </div>
    </form>
  </dialog>;
}
