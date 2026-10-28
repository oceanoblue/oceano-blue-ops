"use client";
import { useState } from "react";
import { countersignConsent, type Countersignature } from "@/lib/crm/smart-experience-types";

export function SmartFileCountersign({ fileId, documentHash, payloadHash, signature, onSigned }: {
  fileId: string; documentHash: string; payloadHash: string;
  signature?: Countersignature | null; onSigned: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (signature) return <p>Office signature: {signature.signer_name} · {new Date(signature.signed_at).toLocaleString()}</p>;
  return <form className="space-y-3 rounded-xl border border-ink-200 bg-white p-5" onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const r = await fetch(`/api/crm/acquisition/files/${fileId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signer_name: name, consent, document_hash: documentHash, payload_hash: payloadHash }) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error || "Signature could not be saved.");
      await onSigned();
    } catch (e) { setError(e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  }}>
    <h3 className="font-semibold">Countersign for Oceano Blue Media</h3>
    <p>Review the client’s selected services and signed agreement above before signing.</p>
    <label className="block">Your full legal name<input className="input mt-2" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
    <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{countersignConsent}</span></label>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <button className="btn-primary" disabled={busy || !consent}>{busy ? "Saving signature…" : "Sign this agreement"}</button>
  </form>;
}
