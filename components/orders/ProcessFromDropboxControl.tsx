'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloudDownload, Loader2 } from 'lucide-react';

/**
 * Order-level "Process from Dropbox" — pulls the uploaded RAWs from the order's
 * Dropbox intake folder, groups brackets, and enqueues the cloud AI pipeline
 * (worker-edit HDR merge → Nano Banana enhance). Outputs land in the gallery.
 */
export function ProcessFromDropboxControl({ orderId, hasIntake }: { orderId: string; hasIntake: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch('/api/re-photo/process-dropbox', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'process_failed');
      setMsg(
        json.queued > 0
          ? `Queued ${json.queued} job(s) from ${json.imported} file(s) — ${json.brackets} bracket(s), ${json.singles} single(s). Merging + enhancing in the cloud; outputs appear in the gallery.`
          : (json.message ?? 'Nothing new to process.')
      );
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? 'Processing failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <button className="btn-primary" disabled={busy || !hasIntake} onClick={run}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
        Process from Dropbox
      </button>
      <p className="mt-2 text-xs text-slate-500">
        {hasIntake
          ? 'Pulls the uploaded RAWs, merges brackets + AI-enhances in the cloud, and posts them to the gallery.'
          : 'Create the upload link above first, then the photographer uploads and you can process here.'}
      </p>
      {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
    </div>
  );
}
