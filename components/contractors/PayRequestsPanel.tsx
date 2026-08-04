'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, DollarSign, CheckCircle2 } from 'lucide-react';
import { fmtCents, fmtDate } from '@/lib/utils/format';

export type PendingPayRequest = {
  id: string;
  contractorName: string;
  contractorEmail: string;
  periodStart: string;
  periodEnd: string;
  shootCount: number;
  totalCents: number;
  notes: string | null;
  submittedAt: string;
};

/** Office inbox for contractor pay requests: each row is one week's request
 *  from one photographer. Marking it paid settles the request AND every shoot
 *  it claims (orders.pay_status → paid) in one transaction. */
export function PayRequestsPanel({ requests }: { requests: PendingPayRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function markPaid(r: PendingPayRequest) {
    setBusy(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/contractors/pay-requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paid_note: noteFor === r.id && note ? note : undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
      setNoteFor(null);
      setNote('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="card overflow-hidden border-amber-200">
      <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
        <DollarSign className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold text-ink-900">
          Pay requests waiting on you
        </span>
        <span className="pill bg-amber-100 text-amber-700">{requests.length}</span>
      </div>
      {error && <p className="px-4 pt-3 text-sm text-rose-600">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {requests.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-900">
                  {r.contractorName}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)} · {r.shootCount} shoot
                    {r.shootCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  Submitted {fmtDate(r.submittedAt)} · {r.contractorEmail}
                </div>
                {r.notes && (
                  <div className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs italic text-slate-600">
                    &ldquo;{r.notes}&rdquo;
                  </div>
                )}
              </div>
              <span className="text-base font-semibold tabular-nums text-ink-900">
                {fmtCents(r.totalCents)}
              </span>
              <button
                onClick={() => (noteFor === r.id ? markPaid(r) : setNoteFor(r.id))}
                disabled={busy === r.id}
                className="btn-secondary inline-flex items-center gap-1.5 text-xs"
              >
                {busy === r.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {noteFor === r.id ? 'Confirm paid' : 'Mark paid'}
              </button>
            </div>
            {noteFor === r.id && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Payment reference (check #, Zelle…) — optional"
                  className="input flex-1 text-xs"
                />
                <button
                  onClick={() => {
                    setNoteFor(null);
                    setNote('');
                  }}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
