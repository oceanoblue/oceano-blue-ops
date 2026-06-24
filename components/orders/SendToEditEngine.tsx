'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Clapperboard, Download, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

interface EditJobView {
  status: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
  error: string | null;
  resultUrl: string | null;
  resultFilename: string | null;
}

const STATUS_COPY: Record<string, { label: string; cls: string }> = {
  queued: { label: 'Queued — waiting for the Mac engine', cls: 'bg-amber-100 text-amber-800' },
  running: { label: 'Rendering in DaVinci Resolve…', cls: 'bg-ocean-100 text-ocean-800' },
  done: { label: 'Render ready for review', cls: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Render failed', cls: 'bg-rose-100 text-rose-800' },
  canceled: { label: 'Canceled', cls: 'bg-slate-100 text-slate-600' },
};

/** Team control: hand a reel/long-form order to the office-Mac Resolve engine,
 *  and show the live edit-job status + the rendered result for review. */
export function SendToEditEngine({
  orderId,
  hasPlan,
  job,
}: {
  orderId: string;
  hasPlan: boolean;
  job: EditJobView | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = job?.status === 'queued' || job?.status === 'running';

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/reels/enqueue-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error === 'no_edit_plan' ? 'Save an edit plan first.' : d.error || 'Failed to queue.');
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {job && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${STATUS_COPY[job.status]?.cls ?? 'bg-slate-100'}`}>
          {job.status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
          {job.status === 'done' && <CheckCircle2 className="h-4 w-4" />}
          {job.status === 'failed' && <AlertCircle className="h-4 w-4" />}
          <span>{STATUS_COPY[job.status]?.label ?? job.status}</span>
        </div>
      )}

      {job?.status === 'done' && job.resultUrl && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={job.resultUrl} controls preload="metadata" className="aspect-[9/16] max-h-[420px] w-full bg-black object-contain" />
          <a
            href={job.resultUrl}
            download
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-ocean-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Download {job.resultFilename ?? 'render'}
          </a>
        </div>
      )}

      {job?.status === 'failed' && job.error && (
        <p className="text-xs text-rose-600">{job.error}</p>
      )}

      <button
        onClick={send}
        disabled={busy || !hasPlan || active}
        className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        title={!hasPlan ? 'Save an edit plan first' : active ? 'A render is already in progress' : ''}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : job?.status === 'failed' ? (
          <RefreshCw className="h-4 w-4" />
        ) : (
          <Clapperboard className="h-4 w-4" />
        )}
        {job?.status === 'failed' ? 'Retry render' : job?.status === 'done' ? 'Re-render' : 'Send to edit engine'}
      </button>

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
