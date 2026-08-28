'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';

type Progress = {
  total: number;
  pending: number;
  running: number;
  complete: number;
  failed: number;
  processed_photos: number;
  active: number;
  done: boolean;
};

/**
 * Fotello-style live progress for an order's AI processing. Polls every 4s while
 * jobs are still active, then stops. Renders nothing until there's a job.
 */
export function OrderProcessingProgress({ orderId }: { orderId: string }) {
  const [p, setP] = useState<Progress | null>(null);
  const [nonce, setNonce] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const r = await fetch(`/api/orders/${orderId}/ai-progress`, { cache: 'no-store' });
        if (!r.ok) return;
        const data: Progress = await r.json();
        if (cancelled) return;
        setP(data);
        // Keep polling only while work is outstanding.
        if (data.active > 0) timer.current = setTimeout(tick, 4000);
      } catch {
        if (!cancelled) timer.current = setTimeout(tick, 8000);
      }
    }
    tick();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [orderId, nonce]);

  async function retry() {
    setRetrying(true);
    try {
      await fetch(`/api/orders/${orderId}/retry-failed`, { method: 'POST' });
      setNonce((n) => n + 1); // restart polling — jobs are pending again
    } finally {
      setRetrying(false);
    }
  }

  if (!p || p.total === 0) return null;

  const pct = p.total ? Math.round((p.complete / p.total) * 100) : 0;
  const barColor = p.failed > 0 && p.active === 0 ? 'bg-amber-500' : 'bg-ocean-600';

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-ink-900">
          {p.active > 0 ? (
            <><Loader2 className="h-4 w-4 animate-spin text-ocean-700" /> Processing photos…</>
          ) : p.failed > 0 ? (
            <><AlertTriangle className="h-4 w-4 text-amber-600" /> Processing finished with issues</>
          ) : (
            <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Photos ready</>
          )}
        </span>
        <span className="tabular-nums text-slate-600">{p.complete}/{p.total} done</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {p.running > 0 && <span>{p.running} running</span>}
        {p.pending > 0 && <span>{p.pending} queued</span>}
        {p.failed > 0 && <span className="text-amber-700">{p.failed} failed</span>}
        {p.processed_photos > 0 && <span>{p.processed_photos} enhanced photo{p.processed_photos === 1 ? '' : 's'}</span>}
        {p.failed > 0 && p.active === 0 && (
          <button
            onClick={retry}
            disabled={retrying}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60"
          >
            {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Retry {p.failed} failed
          </button>
        )}
      </div>
    </div>
  );
}
