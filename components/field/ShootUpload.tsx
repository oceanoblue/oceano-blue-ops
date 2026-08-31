'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, FolderOpen, ExternalLink, CheckCircle2, Copy, Check, Undo2 } from 'lucide-react';

/** Contractor upload step: get the Dropbox folder link for this shoot, upload
 *  the RAWs there, then mark it uploaded so the office picks it up. */
export function ShootUpload({
  orderId,
  intakeUrl,
  status,
}: {
  orderId: string;
  intakeUrl: string | null;
  status: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(intakeUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploaded = ['uploaded', 'processing', 'editing', 'ready', 'delivered'].includes(status);

  async function getFolder() {
    setBusy('folder');
    setError(null);
    try {
      const r = await fetch(`/api/field/shoots/${orderId}/intake`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          d.error === 'dropbox_not_configured'
            ? 'Upload folders aren’t set up yet — contact the office.'
            : d.error || `Failed (${r.status})`
        );
      }
      setUrl(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function markUploaded() {
    setBusy('mark');
    setError(null);
    try {
      const r = await fetch(`/api/field/shoots/${orderId}/uploaded`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function unmarkUploaded() {
    setBusy('unmark');
    setError(null);
    try {
      const r = await fetch(`/api/field/shoots/${orderId}/unmark-uploaded`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (uploaded) {
    // Undo is only offered while the shoot is still exactly 'uploaded' — once the
    // office moves it into processing/editing/etc, the backend refuses the revert.
    const justUploaded = status === 'uploaded';
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-5 w-5" />
          RAWs uploaded — the office has it from here.
        </div>
        {justUploaded && (
          <button
            onClick={unmarkUploaded}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800 disabled:opacity-50"
          >
            {busy === 'unmark' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Undo2 className="h-3.5 w-3.5" />
            )}
            Tapped this by mistake? Undo — I still need to upload
          </button>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!url ? (
        <button
          onClick={getFolder}
          disabled={busy !== null}
          className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50"
        >
          {busy === 'folder' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          Get upload folder
        </button>
      ) : (
        <>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3"
          >
            <ExternalLink className="h-4 w-4" /> Open upload folder
          </a>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
            <span className="min-w-0 flex-1 truncate px-1 text-xs text-slate-500" title={url}>
              {url}
            </span>
            <button onClick={copy} className="btn-ghost inline-flex shrink-0 items-center gap-1 text-xs">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Drop all the RAW files into that Dropbox folder. When they&rsquo;re all in, tap below.
          </p>
          <button
            onClick={markUploaded}
            disabled={busy !== null}
            className="btn-secondary inline-flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50"
          >
            {busy === 'mark' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            I&rsquo;ve uploaded everything
          </button>
        </>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
