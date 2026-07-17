'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);

  async function assign(id: string) {
    setBusy(true);
    setError(null);
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
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
