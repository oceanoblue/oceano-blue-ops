'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check } from 'lucide-react';

export type ClientRecord = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  brokerage: string | null;
  notes: string | null;
};

/** Edit an existing client's details. PATCHes /api/clients/[id]. */
export function ClientEditForm({ client }: { client: ClientRecord }) {
  const router = useRouter();
  const [f, setF] = useState({
    full_name: client.full_name,
    email: client.email,
    phone: client.phone ?? '',
    brokerage: client.brokerage ?? '',
    notes: client.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(f),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || `Failed (${r.status})`);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Full name <span className="text-rose-600">*</span></label>
          <input className="input" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} required />
        </div>
        <div>
          <label className="label">Email <span className="text-rose-600">*</span></label>
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="label">Brokerage</label>
          <input className="input" value={f.brokerage} onChange={(e) => set('brokerage', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Notes (office-only)</label>
        <textarea className="input" rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">{error}</p>}

      <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
        <button className="btn-primary inline-flex items-center gap-2" disabled={busy || !f.full_name.trim() || !f.email.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save changes
        </button>
        {saved && <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><Check className="h-4 w-4" /> Saved</span>}
      </div>
    </form>
  );
}
