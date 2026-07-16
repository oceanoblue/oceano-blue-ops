'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Link2, Copy, Check, FolderOpen } from 'lucide-react';

/** Contractor RAW intake via Dropbox file request. One link per order — the
 *  photographer uploads without any Dropbox account; files land in a
 *  per-order folder that Dropbox desktop syncs to the office Mac. */
export function RawIntakeControl({
  orderId,
  intakeUrl,
  intakePath,
}: {
  orderId: string;
  intakeUrl: string | null;
  intakePath: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/orders/${orderId}/intake-request`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          d.error === 'dropbox_not_configured'
            ? 'Dropbox app credentials are not set up yet — add DROPBOX_APP_KEY / SECRET / REFRESH_TOKEN in Vercel.'
            : d.error || `Failed (${r.status})`
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!intakeUrl) return;
    await navigator.clipboard.writeText(intakeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!intakeUrl) {
    return (
      <div className="space-y-2">
        <button
          onClick={createLink}
          disabled={busy}
          className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Create upload link
        </button>
        <p className="text-xs text-slate-500">
          Generates a Dropbox file-request link for the photographer — no account needed on
          their side. Files land in a per-order folder.
        </p>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <a
          href={intakeUrl}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-ocean-700 hover:underline"
          title={intakeUrl}
        >
          {intakeUrl}
        </a>
        <button onClick={copy} className="btn-ghost inline-flex shrink-0 items-center gap-1">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {intakePath && (
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <FolderOpen className="h-3.5 w-3.5" />
          Dropbox: {intakePath} (syncs to this Mac)
        </p>
      )}
      <p className="text-xs text-slate-500">
        Text or email this link to the photographer — uploads land in the folder above.
      </p>
    </div>
  );
}
