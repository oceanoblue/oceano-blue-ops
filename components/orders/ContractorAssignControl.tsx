'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export type ContractorOption = { id: string; full_name: string; pay_rate_cents: number };

/** Office control: assign a contractor photographer to this shoot. Snapshots
 *  the contractor's flat rate onto the order so payout math is stable even if
 *  the rate later changes. Team RLS permits the direct order update. */
export function ContractorAssignControl({
  orderId,
  contractorId,
  contractors,
}: {
  orderId: string;
  contractorId: string | null;
  contractors: ContractorOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignedName = contractors.find((c) => c.id === contractorId)?.full_name;

  async function assign(id: string) {
    setBusy(true);
    setError(null);
    setSentTo(null);
    try {
      const supabase = createClient();
      const chosen = contractors.find((c) => c.id === id);
      const patch: { contractor_id: string | null; pay_amount_cents?: number } = {
        contractor_id: id || null,
      };
      // Snapshot the rate on assignment (only when assigning someone).
      if (chosen) patch.pay_amount_cents = chosen.pay_rate_cents;
      const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
      if (error) throw error;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendUploadLink() {
    setSending(true);
    setError(null);
    setSentTo(null);
    try {
      const r = await fetch(`/api/orders/${orderId}/notify-contractor`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          d.error === 'email_not_configured'
            ? 'Email isn’t set up yet — add a Resend API key (RESEND_API_KEY) in Vercel.'
            : d.error === 'dropbox_not_configured'
              ? 'Dropbox isn’t set up — can’t create the upload folder.'
              : d.error || `Failed (${r.status})`
        );
      }
      setSentTo(d.to ?? 'the photographer');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <label className="label flex items-center gap-2">
        Contractor photographer
        {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
      </label>
      <select
        value={contractorId ?? ''}
        onChange={(e) => assign(e.target.value)}
        disabled={busy}
        className="input"
      >
        <option value="">— Unassigned —</option>
        {contractors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}
            {c.pay_rate_cents ? ` · $${(c.pay_rate_cents / 100).toFixed(0)}/property` : ''}
          </option>
        ))}
      </select>

      {contractorId && (
        <div className="mt-2">
          <button
            onClick={sendUploadLink}
            disabled={sending}
            className="btn-secondary inline-flex w-full items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Email upload link to {assignedName?.split(' ')[0] ?? 'photographer'}
          </button>
          {sentTo && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Sent to {sentTo}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
