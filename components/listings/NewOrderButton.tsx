'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CameraIcon } from 'lucide-react';

/** One-click "start a photo order" from the listing — listing-first workflow. */
export function NewOrderButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `error_${res.status}`);
      router.push(`/dashboard/orders/${json.order_id}`);
    } catch (err: any) {
      setError(err?.message ?? 'failed');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={create} disabled={busy} className="btn-primary">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CameraIcon className="h-4 w-4" />}
        New photo order
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
