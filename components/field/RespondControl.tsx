'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Response = 'accepted' | 'declined' | null;

/**
 * Contractor accept/decline for an assigned shoot. Calls the SECURITY DEFINER
 * respond_to_assignment RPC (re-derives the caller server-side), which records
 * the response on the order and logs an assignment_events row so the office is
 * notified instead of a hand-back being silent.
 */
export function RespondControl({
  orderId,
  response,
  note,
}: {
  orderId: string;
  response: Response;
  note: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'accepted' | 'declined'>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function respond(kind: 'accepted' | 'declined', noteText?: string) {
    setBusy(kind);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await (supabase.rpc as any)('respond_to_assignment', {
        p_order_id: orderId,
        p_response: kind,
        p_note: noteText?.trim() || null,
      });
      if (error) throw error;
      if (data && data.ok === false) {
        throw new Error(
          data.reason === 'not_your_assignment'
            ? "This shoot isn't assigned to you."
            : data.reason || 'Could not save your response.'
        );
      }
      setDeclining(false);
      setReason('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Already accepted.
  if (response === 'accepted' && !declining) {
    return (
      <div className="rounded-lg bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200">
        <p className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> You accepted this shoot
        </p>
        <button onClick={() => setDeclining(true)} className="mt-1 text-xs text-slate-500 underline hover:text-slate-700">
          Something changed — decline instead
        </button>
      </div>
    );
  }

  // Already declined.
  if (response === 'declined' && !declining) {
    return (
      <div className="rounded-lg bg-rose-50 p-3 text-sm ring-1 ring-rose-200">
        <p className="inline-flex items-center gap-1.5 font-medium text-rose-800">
          <XCircle className="h-4 w-4" /> You declined this shoot
        </p>
        {note && <p className="mt-0.5 text-xs text-rose-700">“{note}”</p>}
        <p className="mt-1 text-xs text-slate-500">The office has been notified and will reassign it.</p>
        <button
          onClick={() => respond('accepted')}
          disabled={busy === 'accepted'}
          className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 underline hover:text-slate-700"
        >
          {busy === 'accepted' && <Loader2 className="h-3 w-3 animate-spin" />} Actually, I can take it
        </button>
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  // Decline reason entry.
  if (declining) {
    return (
      <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <label className="label">Why are you declining? (optional, helps the office)</label>
        <textarea
          className="input"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Double-booked that morning…"
          autoFocus
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => respond('declined', reason)}
            disabled={busy === 'declined'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy === 'declined' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Confirm decline
          </button>
          <button onClick={() => { setDeclining(false); setReason(''); }} className="btn-ghost text-sm">Back</button>
        </div>
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  // Not yet responded → prompt.
  return (
    <div className="rounded-lg bg-ocean-50 p-3 ring-1 ring-ocean-200">
      <p className="mb-2 text-sm font-medium text-ocean-900">Can you take this shoot?</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => respond('accepted')}
          disabled={busy === 'accepted'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === 'accepted' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Accept
        </button>
        <button
          onClick={() => setDeclining(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
        >
          <X className="h-4 w-4" /> Decline
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
