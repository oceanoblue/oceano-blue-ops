'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wallet, Check, Pencil } from 'lucide-react';

export const PAYOUT_METHODS = [
  { value: 'zelle', label: 'Zelle', hint: 'The email or phone on your Zelle account' },
  { value: 'venmo', label: 'Venmo', hint: 'Your @handle' },
  { value: 'ach', label: 'Bank transfer (ACH)', hint: 'Bank name + last 4 — the office will collect full details securely' },
  { value: 'paypal', label: 'PayPal', hint: 'Your PayPal email' },
  { value: 'check', label: 'Check', hint: 'Mailing address for the check' },
  { value: 'other', label: 'Other', hint: 'Tell the office how you want to be paid' },
] as const;

export function payoutLabel(method: string | null | undefined) {
  return PAYOUT_METHODS.find((m) => m.value === method)?.label ?? null;
}

/** "How you get paid" card on /field/pay: the photographer picks a payout
 *  method + details once; every pay request they submit snapshots it for the
 *  office. Editable any time. */
export function PayoutMethodCard({
  method,
  details,
}: {
  method: string | null;
  details: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!method);
  const [m, setM] = useState(method ?? 'zelle');
  const [d, setD] = useState(details ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = PAYOUT_METHODS.find((x) => x.value === m);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/field/payout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: m, details: d || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-ocean-100 text-ocean-700">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">How you get paid</h2>
            {!editing && method && (
              <p className="text-sm text-slate-600">
                {payoutLabel(method)}
                {details ? <span className="text-slate-400"> · {details}</span> : null}
              </p>
            )}
          </div>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn-ghost inline-flex items-center gap-1.5 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Change
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {PAYOUT_METHODS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setM(opt.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  m === opt.value
                    ? 'bg-ink-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Details</label>
            <input
              value={d}
              onChange={(e) => setD(e.target.value)}
              placeholder={selected?.hint}
              className="input"
            />
            {m === 'ach' && (
              <p className="mt-1 text-xs text-slate-400">
                Don&rsquo;t put full account or routing numbers here — the office will collect those
                securely.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </button>
            {method && (
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
