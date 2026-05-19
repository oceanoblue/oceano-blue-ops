'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';

interface RawCleanupControlProps {
  orderId: string;
  /** Number of camera-RAW files on this order. We hide the button if 0. */
  rawCount: number;
}

/**
 * "Delete RAW originals" button, intended for the order detail page once the
 * order is delivered. Two-click safety: first click reveals the confirmation
 * pill with file count, second click actually runs the cleanup.
 */
export function RawCleanupControl({ orderId, rawCount }: RawCleanupControlProps) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (rawCount === 0) return null;

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/photos/cleanup-raws', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'cleanup_failed');
        return;
      }
      setResult(`Deleted ${data.deleted} RAW file${data.deleted === 1 ? '' : 's'}.`);
      setArmed(false);
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!armed ? (
        <button
          onClick={() => setArmed(true)}
          className="btn-ghost text-rose-700 hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />
          Delete RAW originals ({rawCount})
        </button>
      ) : (
        <>
          <span className="text-sm text-slate-700">
            Permanently delete {rawCount} camera-RAW file{rawCount === 1 ? '' : 's'}?
          </span>
          <button
            onClick={run}
            disabled={running}
            className="btn-primary bg-rose-600 hover:bg-rose-700"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Confirm delete
          </button>
          <button onClick={() => setArmed(false)} className="btn-ghost" disabled={running}>
            Cancel
          </button>
        </>
      )}
      {result && <span className="text-sm text-emerald-700">{result}</span>}
      {error && <span className="text-sm text-rose-700">{error}</span>}
    </div>
  );
}
