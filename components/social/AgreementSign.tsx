"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_SIGNING_CONSENT } from "@/lib/social/schema";

/** The form a client fills in to sign an agreement. Typing their name is the signature. */
export function AgreementSign({ token, documentHash, readOnly }: { token: string; documentHash: string; readOnly: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ signer_name: "", signer_title: "", signer_email: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/social-public/agreements/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, consent: true, document_hash: documentHash }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Your signature could not be saved. Please try again.");
      // The page now shows the signed copy.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your signature could not be saved. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={sign} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Your full legal name</span>
          <input className="input" required minLength={2} maxLength={120} autoComplete="name" value={form.signer_name} onChange={set("signer_name")} />
        </label>
        <label>
          <span className="label">Your title</span>
          <input className="input" maxLength={120} autoComplete="organization-title" value={form.signer_title} onChange={set("signer_title")} />
        </label>
        <label>
          <span className="label">Your email</span>
          <input type="email" className="input" required maxLength={254} autoComplete="email" value={form.signer_email} onChange={set("signer_email")} />
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
        <input type="checkbox" className="mt-1" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{CLIENT_SIGNING_CONSENT}</span>
      </label>
      {form.signer_name.trim().length >= 2 && (
        <p className="rounded-xl bg-ink-50 px-5 py-4 ring-1 ring-ink-100">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-wider text-slate-500">Your signature</span>
          <span className="mt-1 block font-display text-3xl italic text-ocean-950">{form.signer_name.trim()}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn-primary" disabled={busy || readOnly || !consent}>
          {busy ? "Signing..." : "Sign the agreement"}
        </button>
        {readOnly && <p className="text-sm text-amber-800">This is a preview. Signing works on the live page only.</p>}
      </div>
      <p role="alert" className="text-sm text-rose-700">{error}</p>
    </form>
  );
}
