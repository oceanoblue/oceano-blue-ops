"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, X } from "lucide-react";
import type { EmailDraft } from "@/lib/operations/types";

export function DraftDialog({ initial, onClose }: { initial: EmailDraft; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  function change(key: keyof EmailDraft, value: string) {
    setDraft(prev => ({ ...prev, [key]: value }));
    setNotice("");
    setError("");
  }
  async function copy() {
    setError("");
    setNotice("");
    try {
      await navigator.clipboard.writeText(`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`);
      setNotice("Draft copied. Paste it into your preferred messaging app.");
    } catch { setError("Select and copy the draft text manually."); }
  }
  return <dialog ref={dialog} onClose={onClose}
    aria-labelledby="draft-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
      <div><p className="text-xs uppercase tracking-[.18em] text-ocean-700">Your next move</p><h2 id="draft-title" className="mt-1 text-xl font-semibold">Prepare editor message</h2></div>
      <button type="button" aria-label="Close draft" onClick={() => dialog.current?.close()} className="rounded-lg p-3 hover:bg-slate-100"><X className="h-5 w-5"/></button>
    </div>
    <div className="space-y-4 p-6">
      <label className="block text-sm font-medium">To<input autoFocus type="email" maxLength={254} value={draft.to} onChange={e => change("to", e.target.value)} className="input mt-1 w-full" placeholder="Recipient’s email (optional)"/></label>
      <label className="block text-sm font-medium">Subject<input maxLength={250} value={draft.subject} onChange={e => change("subject", e.target.value)} className="input mt-1 w-full"/></label>
      <label className="block text-sm font-medium">Message<textarea maxLength={12000} rows={11} value={draft.body} onChange={e => change("body", e.target.value)} className="input mt-1 w-full text-sm leading-relaxed"/></label>
      <p className="text-xs text-slate-500">Add media links the editor can access. Copy this message to send through your preferred app.</p>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-ocean-800">{notice}</p>}
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <button type="button" onClick={() => void copy()} className="btn-primary"><Copy className="h-4 w-4"/>Copy draft</button>
      </div>
    </div>
  </dialog>;
}
