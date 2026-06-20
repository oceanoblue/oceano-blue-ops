'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Loader2, X } from 'lucide-react';

/**
 * Inline "Add client" affordance for the Clients page. A button that reveals a
 * compact create form, posts to /api/clients, and refreshes the list. Keeps the
 * user on the page (no nav) for fast repeat entry.
 */
export function NewClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ full_name: '', email: '', phone: '', brokerage: '' });

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(f),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? json.error ?? `error_${res.status}`);
      setF({ full_name: '', email: '', phone: '', brokerage: '' });
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Add client
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card absolute right-0 top-12 z-20 w-[22rem] space-y-3 p-4 shadow-lift">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ocean-900">New client</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div>
        <label className="label">Full name *</label>
        <input className="input" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} required autoFocus />
      </div>
      <div>
        <label className="label">Email *</label>
        <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Phone</label>
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="label">Brokerage</label>
          <input className="input" value={f.brokerage} onChange={(e) => set('brokerage', e.target.value)} />
        </div>
      </div>
      <button type="submit" className="btn-primary w-full" disabled={busy || !f.full_name.trim() || !f.email.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Create client
      </button>
    </form>
  );
}
