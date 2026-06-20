'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';

/**
 * "Delete order" — permanently removes the ENTIRE order: all storage objects
 * (originals, converted JPEGs, processed outputs) and the order row with its
 * cascading children. For junk: duplicate uploads, empty/test orders.
 *
 * Two-step safety: the first click fetches a dry-run preview (file count + size)
 * and arms the confirm; the second click actually deletes and returns to the
 * orders list.
 */
export function DeleteOrderControl({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [preview, setPreview] = useState<{ files: number; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function arm() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/orders/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, dry_run: true }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'preview_failed');
        return;
      }
      setPreview({ files: d.files ?? 0, bytes: d.bytes ?? 0 });
      setArmed(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/orders/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'delete_failed');
        return;
      }
      router.push('/dashboard/orders');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const mb = preview ? (preview.bytes / 1024 / 1024).toFixed(0) : '0';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!armed ? (
        <button onClick={arm} disabled={busy} className="btn-ghost text-rose-700 hover:bg-rose-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete entire order
        </button>
      ) : (
        <>
          <span className="flex items-center gap-1.5 text-sm text-rose-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Permanently delete this order and {preview?.files ?? 0} file{preview?.files === 1 ? '' : 's'} ({mb} MB)? This cannot be undone.
          </span>
          <button onClick={confirm} disabled={busy} className="btn-primary bg-rose-600 hover:bg-rose-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Confirm delete
          </button>
          <button onClick={() => setArmed(false)} disabled={busy} className="btn-ghost">
            Cancel
          </button>
        </>
      )}
      {error && <span className="text-sm text-rose-700">{error}</span>}
    </div>
  );
}
