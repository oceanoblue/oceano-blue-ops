'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus, Check, DollarSign, Pencil, Trash2, Power } from 'lucide-react';
import { payoutLabel } from '@/components/field/PayoutMethodCard';

export type ContractorRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  pay_rate_small_cents: number;
  pay_rate_large_cents: number;
  pay_rate_360_cents: number;
  payout_method: string | null;
  payout_details: string | null;
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
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', small: '60', large: '75', x360: '20' });

  async function patch(id: string, body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    try {
      const r = await fetch(`/api/contractors/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed');
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

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
          pay_rate_small_cents: Math.round(Number(form.small || 0) * 100),
          pay_rate_large_cents: Math.round(Number(form.large || 0) * 100),
          pay_rate_360_cents: Math.round(Number(form.x360 || 0) * 100),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      setForm({ full_name: '', email: '', phone: '', small: '60', large: '75', x360: '20' });
      setAdding(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function saveRates(id: string, rates: { small: string; large: string; x360: string }) {
    return patch(
      id,
      {
        action: 'update',
        pay_rate_small_cents: Math.round(Number(rates.small || 0) * 100),
        pay_rate_large_cents: Math.round(Number(rates.large || 0) * 100),
        pay_rate_360_cents: Math.round(Number(rates.x360 || 0) * 100),
      },
      `rate-${id}`
    );
  }

  function saveContact(id: string, contact: { full_name: string; email: string; phone: string }) {
    return patch(
      id,
      { action: 'update', full_name: contact.full_name, email: contact.email, phone: contact.phone || null },
      `contact-${id}`
    );
  }

  function toggleActive(c: ContractorRow) {
    if (
      c.is_active &&
      !confirm(`Deactivate ${c.full_name}? They'll lose portal access until reactivated; all records stay.`)
    )
      return Promise.resolve(false);
    return patch(c.id, { action: 'update', is_active: !c.is_active }, `active-${c.id}`);
  }

  async function deleteContractor(c: ContractorRow) {
    if (!confirm(`Delete ${c.full_name}? This only works for photographers with no logged shoots.`)) return;
    setBusy(`delete-${c.id}`);
    setError(null);
    try {
      const r = await fetch(`/api/contractors/${c.id}`, { method: 'DELETE' });
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
    await patch(id, { action: 'mark_paid' }, `paid-${id}`);
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
            <label className="label">Rates ($ small / large / 360 add-on)</label>
            <div className="flex items-center gap-2">
              <input inputMode="decimal" value={form.small} onChange={(e) => setForm({ ...form, small: e.target.value })} placeholder="60" className="input" aria-label="Small home rate" />
              <input inputMode="decimal" value={form.large} onChange={(e) => setForm({ ...form, large: e.target.value })} placeholder="75" className="input" aria-label="Large home rate" />
              <input inputMode="decimal" value={form.x360} onChange={(e) => setForm({ ...form, x360: e.target.value })} placeholder="20" className="input" aria-label="360 photos add-on rate" />
            </div>
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
                <th className="table-head px-4 py-3">Rates (S / L / 360)</th>
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
                rows.map((c) => (
                  <Row
                    key={c.id}
                    c={c}
                    busy={busy}
                    onSaveRates={saveRates}
                    onSaveContact={saveContact}
                    onToggleActive={toggleActive}
                    onDelete={deleteContractor}
                    onMarkPaid={markPaid}
                  />
                ))
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
  onSaveRates,
  onSaveContact,
  onToggleActive,
  onDelete,
  onMarkPaid,
}: {
  c: ContractorRow;
  busy: string | null;
  onSaveRates: (id: string, rates: { small: string; large: string; x360: string }) => Promise<boolean>;
  onSaveContact: (id: string, contact: { full_name: string; email: string; phone: string }) => Promise<boolean>;
  onToggleActive: (c: ContractorRow) => Promise<boolean>;
  onDelete: (c: ContractorRow) => void;
  onMarkPaid: (id: string, count: number) => void;
}) {
  const [rates, setRates] = useState({
    small: (c.pay_rate_small_cents / 100).toString(),
    large: (c.pay_rate_large_cents / 100).toString(),
    x360: (c.pay_rate_360_cents / 100).toString(),
  });
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState({ full_name: c.full_name, email: c.email, phone: c.phone ?? '' });
  const dirty =
    Math.round(Number(rates.small) * 100) !== c.pay_rate_small_cents ||
    Math.round(Number(rates.large) * 100) !== c.pay_rate_large_cents ||
    Math.round(Number(rates.x360) * 100) !== c.pay_rate_360_cents;
  const emailChanged = contact.email.trim().toLowerCase() !== c.email.toLowerCase();

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    if (
      emailChanged &&
      !confirm(
        `Change ${c.full_name}'s sign-in email to ${contact.email.trim()}? Their old email stops working and they'll sign in fresh with the new one.`
      )
    )
      return;
    const ok = await onSaveContact(c.id, {
      full_name: contact.full_name.trim(),
      email: contact.email.trim(),
      phone: contact.phone.trim(),
    });
    if (ok) setEditing(false);
  }

  return (
    <>
      <tr className={`border-b border-slate-50 last:border-0 ${c.is_active ? '' : 'opacity-60'}`}>
        <td className="px-4 py-3">
          <div className="font-medium text-ink-900">
            {c.full_name}
            {!c.is_active && <span className="ml-2 pill bg-slate-100 text-slate-500">Deactivated</span>}
          </div>
          <div className="text-xs text-slate-500">{c.email}</div>
          {c.payout_method && (
            <div className="text-xs text-slate-500">
              {payoutLabel(c.payout_method) ?? c.payout_method}
              {c.payout_details ? ` · ${c.payout_details}` : ''}
            </div>
          )}
          {!c.linked && c.is_active && <div className="text-xs text-amber-600">Hasn’t signed in yet</div>}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <span className="text-slate-400">$</span>
            <input
              inputMode="decimal"
              value={rates.small}
              onChange={(e) => setRates({ ...rates, small: e.target.value })}
              className="w-12 rounded border-slate-200 px-1.5 py-1 text-sm"
              title="Small home (below the sqft cutoff)"
              aria-label="Small home rate"
            />
            <span className="text-slate-300">/</span>
            <input
              inputMode="decimal"
              value={rates.large}
              onChange={(e) => setRates({ ...rates, large: e.target.value })}
              className="w-12 rounded border-slate-200 px-1.5 py-1 text-sm"
              title="Larger home (at/above the sqft cutoff)"
              aria-label="Large home rate"
            />
            <span className="text-slate-300">/</span>
            <input
              inputMode="decimal"
              value={rates.x360}
              onChange={(e) => setRates({ ...rates, x360: e.target.value })}
              className="w-12 rounded border-slate-200 px-1.5 py-1 text-sm"
              title="360 photos add-on"
              aria-label="360 photos add-on rate"
            />
            {dirty && (
              <button
                onClick={() => onSaveRates(c.id, rates)}
                disabled={busy === `rate-${c.id}`}
                className="text-ocean-600 hover:text-ocean-700"
                title="Save rates"
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
          <div className="flex items-center justify-end gap-1">
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
            <button
              onClick={() => setEditing((v) => !v)}
              className={`rounded-lg p-2 transition ${editing ? 'bg-ocean-100 text-ocean-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
              title="Edit name, email, phone"
              aria-label={`Edit ${c.full_name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => onToggleActive(c)}
              disabled={busy === `active-${c.id}`}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              title={c.is_active ? 'Deactivate (blocks portal access, keeps records)' : 'Reactivate'}
              aria-label={c.is_active ? `Deactivate ${c.full_name}` : `Reactivate ${c.full_name}`}
            >
              {busy === `active-${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
            </button>
            <button
              onClick={() => onDelete(c)}
              disabled={busy === `delete-${c.id}`}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              title="Delete (only if they have no logged shoots)"
              aria-label={`Delete ${c.full_name}`}
            >
              {busy === `delete-${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-slate-50 bg-slate-50/60">
          <td colSpan={6} className="px-4 py-3">
            <form onSubmit={submitContact} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Full name</label>
                <input
                  required
                  value={contact.full_name}
                  onChange={(e) => setContact({ ...contact, full_name: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Email (their sign-in)</label>
                <input
                  required
                  type="email"
                  value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                  className="input"
                />
              </div>
              <div className="flex items-center gap-2 pb-0.5">
                <button
                  type="submit"
                  disabled={busy === `contact-${c.id}`}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {busy === `contact-${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
                  Cancel
                </button>
              </div>
              {emailChanged && (
                <p className="w-full text-xs text-amber-600">
                  Changing the email unlinks their current sign-in — they&rsquo;ll use a fresh magic link with the new
                  address.
                </p>
              )}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
