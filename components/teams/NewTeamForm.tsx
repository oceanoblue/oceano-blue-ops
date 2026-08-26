'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users2, Loader2, X } from 'lucide-react';

/** Inline "New team" affordance for the Teams page. */
export function NewTeamForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', brokerage: '' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/client-teams', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(f),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? json.error ?? `error_${res.status}`);
      setOpen(false);
      setF({ name: '', brokerage: '' });
      router.push(`/dashboard/teams/${json.id}`);
    } catch (err: any) {
      setError(err?.message ?? 'failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Users2 className="h-4 w-4" /> New team
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card absolute right-0 top-12 z-20 w-[22rem] space-y-3 p-4 shadow-lift">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ocean-900">New team</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div>
        <label className="label">Team name *</label>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Amy Dauplaise's Team" required autoFocus />
      </div>
      <div>
        <label className="label">Brokerage</label>
        <input className="input" value={f.brokerage} onChange={(e) => setF({ ...f, brokerage: e.target.value })} placeholder="Keller Williams Lowcountry" />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={busy || !f.name.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}
        Create team
      </button>
    </form>
  );
}
