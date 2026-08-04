'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, DollarSign, CheckCircle2, Clock } from 'lucide-react';
import { fmtCents, fmtDate } from '@/lib/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';

export type EligibleShoot = {
  id: string;
  address: string;
  cityState: string;
  shotAt: string;
  status: string;
  payCents: number;
};

export type PayRequestRow = {
  id: string;
  period_start: string;
  period_end: string;
  status: 'submitted' | 'paid';
  shoot_count: number;
  total_cents: number;
  notes: string | null;
  paid_note: string | null;
  paid_at: string | null;
  created_at: string;
};

/** Weekly pay request form for contractors: pick the completed shoots to
 *  invoice (all pre-checked), add an optional note, submit. Below it, the
 *  history of past requests and whether the office has paid them yet. */
export function PayRequestForm({
  shoots,
  awaitingUploadCount,
  requests,
}: {
  shoots: EligibleShoot[];
  awaitingUploadCount: number;
  requests: PayRequestRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(shoots.map((s) => s.id)));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const totalCents = useMemo(
    () => shoots.filter((s) => selected.has(s.id)).reduce((sum, s) => sum + s.payCents, 0),
    [shoots, selected]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setError('Select at least one shoot.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/field/pay-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_ids: Array.from(selected), notes: notes || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      setSubmitted(true);
      setNotes('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {submitted && (
        <div className="card flex items-start gap-3 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">Pay request submitted</div>
            <div>The office has been notified. You&rsquo;ll see it move to Paid below once it&rsquo;s settled.</div>
          </div>
        </div>
      )}

      {/* This week's request */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">This week&rsquo;s request</h2>
        <p className="mt-1 text-sm text-slate-500">
          These are your completed shoots that haven&rsquo;t been paid or requested yet. Uncheck any you
          want to hold for a later week.
        </p>

        {shoots.length === 0 ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            Nothing to request right now — every completed shoot is either already requested or paid.
            {awaitingUploadCount > 0 && (
              <span>
                {' '}
                {awaitingUploadCount} shoot{awaitingUploadCount === 1 ? ' is' : 's are'} still waiting on
                RAW uploads; they&rsquo;ll show up here once the files are in.
              </span>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {shoots.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 p-3 transition hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      className="h-4 w-4 rounded border-slate-300 text-ocean-600 focus:ring-ocean-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">{s.address}</div>
                      <div className="truncate text-xs text-slate-500">
                        {[s.cityState, `shot ${fmtDate(s.shotAt)}`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <StatusBadge status={s.status} className="hidden shrink-0 sm:inline-flex" />
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">
                      {fmtCents(s.payCents)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            {awaitingUploadCount > 0 && (
              <p className="text-xs text-slate-400">
                {awaitingUploadCount} more shoot{awaitingUploadCount === 1 ? '' : 's'} will become
                requestable once the RAWs are uploaded.
              </p>
            )}

            <div>
              <label className="label">Note to the office (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything they should know — mileage, a reshoot, a rate question…"
                className="input"
              />
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Requesting</div>
                <div className="font-display text-2xl font-semibold text-ink-900">
                  {fmtCents(totalCents)}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    {selected.size} shoot{selected.size === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <button
                type="submit"
                disabled={busy || selected.size === 0}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                Submit pay request
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Past requests */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Past requests</h2>
        {requests.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No requests yet. Your submitted weeks will show up here with their payment status.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                  {r.status === 'paid' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Clock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink-900">
                    {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {r.shoot_count} shoot{r.shoot_count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    Submitted {fmtDate(r.created_at)}
                    {r.status === 'paid' && r.paid_at ? ` · paid ${fmtDate(r.paid_at)}` : ''}
                    {r.paid_note ? ` · ${r.paid_note}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">
                  {fmtCents(r.total_cents)}
                </span>
                <span
                  className={`pill shrink-0 ${
                    r.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {r.status === 'paid' ? 'Paid' : 'Submitted'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
