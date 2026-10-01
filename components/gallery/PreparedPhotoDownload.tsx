'use client';

import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';

type Ready = { downloadUrl: string; filename: string; photoCount: number; bytes: number; verified: boolean; expiresAt: number };
type Props = { photoCount: number; children: React.ReactElement<React.AnchorHTMLAttributes<HTMLAnchorElement>> };

/** Keep a normal anchor as the no-JS fallback, but never fetch a multi-GB ZIP
 * into browser memory. Preparation returns small JSON; the ready anchor is a
 * normal, repeatable storage download with Content-Length and attachment headers.
 */
export function PreparedPhotoDownload({ photoCount, children }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [ready, setReady] = React.useState<Ready | null>(null);
  const [error, setError] = React.useState('');
  const controller = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => controller.current?.abort(), []);

  async function prepare(event: React.MouseEvent<HTMLAnchorElement>) {
    if (ready && ready.expiresAt > Date.now()) return;
    event.preventDefault();
    if (controller.current) return;
    setReady(null); setBusy(true); setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      const href = children.props.href!;
      const response = await fetch(`${href}${href.includes('?') ? '&' : '?'}prepare=1`, { signal: request.signal, cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 402) throw new Error('Please refresh the gallery to check payment status.');
        if (response.status === 429) throw new Error('Another download is being prepared. Please try again shortly.');
        throw new Error('The ZIP could not be completed. Please try again or contact us.');
      }
      const data = await response.json() as Ready;
      if (!data.verified || data.photoCount !== photoCount || data.bytes <= 22 || !data.downloadUrl?.startsWith('https://')) {
        throw new Error('The download could not be verified. Please contact us.');
      }
      setReady(data);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not prepare the download.');
    } finally {
      controller.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return <div className="max-w-sm space-y-2">
    {React.cloneElement(children, {
      href: ready?.downloadUrl ?? children.props.href,
      download: ready?.filename ?? true,
      onClick: prepare,
      'aria-disabled': busy || undefined,
      'aria-busy': busy || undefined,
      children: busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing ZIP...</>
        : ready ? <><Download className="h-4 w-4" /> Download ZIP ({photoCount})</> : children.props.children,
    })}
    {busy && <p role="status" className="text-xs leading-relaxed text-slate-500">Preparing and checking all {photoCount} photos. Large galleries may take a few minutes. Please keep this page open.</p>}
    {ready && <p role="status" className="text-xs leading-relaxed text-emerald-700">Your complete ZIP is ready. Tap Download ZIP to save it.</p>}
    {error && <p role="alert" className="text-xs leading-relaxed text-rose-700">{error}</p>}
  </div>;
}
