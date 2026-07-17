'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus, Check, DollarSign } from 'lucide-react';

export type ContractorRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  pay_rate_cents: number;
  is_active: boolean;
  linked: boolean;
  total: number;
  thisMonth: number;
  unpaidCount: number;
  owedCents: number;
};

function dollars(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function ContractorRoster({ rows }: { rows: ContractorRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', rate: '' });

  async function addContractor(e: React.FormEvent) {
    e.preventDefault();
    setBusy('add');
    setError(null);
    try {
      const r = await fetch('/api/contractors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          phone: form.phone || undefined,
          pay_rate_cents: form.rate ? Math.round(Number(form.rate) * 100) : 0,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      setForm({ full_name: '', email: '', phone: '', rate: '' });
      setAdding(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveRate(id: string, rate: string) {
    setBusy(`rate-${id}`);
    setError(null);
    try {
      const r = await fetch(`/api/contractors/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'update', pay_rate_cents: Math.round(Number(rate) * 100) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(id: string, count: number) {
    if (!confirm(`Mark ${count} shoot${count === 1 ? '' : 's'} as paid? This clears what's currently owed.`)) return;
    setBusy(`paid-${id}`);
    setError(null);
    try {
      const r = await fetch(`/api/contractors/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {rows.length} photographer{rows.length === 1 ? '' : 's'}
        </p>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary inline-flex items-center gap-1.5">
          <UserPlus className="h-4 w-4" /> Add photographer
        </button>
      </div>

      {adding && (
        <form onSubmit={addContractor} className="card grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <label className="label">Full name</label>
            <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Email (their sign-in)</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Phone (optional)</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Rate per property ($)</label>
            <input inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="e.g. 75" className="input" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <button type="submit" disabled={busy === 'add'} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
              {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="table-head px-4 py-3">Photographer</th>
                <th className="table-head px-4 py-3">Rate</th>
                <th className="table-head px-4 py-3 text-right">This month</th>
                <th className="table-head px-4 py-3 text-right">Total</th>
                <th className="table-head px-4 py-3 text-right">Owed</th>
                <th className="table-head px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No photographers yet. Add one to send them the field portal.
                  </td>
                </tr>
              ) : (
                rows.map((c) => <Row key={c.id} c={c} busy={busy} onSaveRate={saveRate} onMarkPaid={markPaid} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({
  c,
  busy,
  onSaveRate,
  onMarkPaid,
}: {
  c: ContractorRow;
  busy: string | null;
  onSaveRate: (id: string, rate: string) => void;
  onMarkPaid: (id: string, count: number) => void;
}) {
  const [rate, setRate] = useState((c.pay_rate_cents / 100).toString());
  const dirty = Math.round(Number(rate) * 100) !== c.pay_rate_cents;

  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium text-ink-900">
          {c.full_name}
          {!c.is_active && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
        </div>
        <div className="text-xs text-slate-500">{c.email}</div>
        {!c.linked && <div className="text-xs text-amber-600">Hasn’t signed in yet</div>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">$</span>
          <input
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-16 rounded border-slate-200 px-1.5 py-1 text-sm"
          />
          {dirty && (
            <button
              onClick={() => onSaveRate(c.id, rate)}
              disabled={busy === `rate-${c.id}`}
              className="text-ocean-600 hover:text-ocean-700"
              title="Save rate"
            >
              {busy === `rate-${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{c.thisMonth}</td>
      <td className="px-4 py-3 text-right tabular-nums">{c.total}</td>
      <td className="px-4 py-3 text-right">
        <span className={c.owedCents > 0 ? 'font-semibold text-ink-900' : 'text-slate-400'}>
          {dollars(c.owedCents)}
        </span>
        <div className="text-xs text-slate-400">{c.unpaidCount} unpaid</div>
      </td>
      <td className="px-4 py-3 text-right">
        {c.unpaidCount > 0 && (
          <button
            onClick={() => onMarkPaid(c.id, c.unpaidCount)}
            disabled={busy === `paid-${c.id}`}
            className="btn-secondary inline-flex items-center gap-1.5 text-xs"
          >
            {busy === `paid-${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
            Mark paid
          </button>
        )}
      </td>
    </tr>
  );
}
