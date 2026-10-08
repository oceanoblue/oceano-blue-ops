'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

export type ReadyFile = { downloadUrl: string; filename: string; photoCount: number; bytes: number; verified: boolean; expiresAt: number; firstPhoto?: number; lastPhoto?: number };
type Ready = { downloadUrl?: string | null; filename: string; photoCount: number; bytes: number; verified: boolean; expiresAt: number; downloads?: ReadyFile[] };
type Props = { photoCount: number; children: React.ReactElement<React.AnchorHTMLAttributes<HTMLAnchorElement>> };

export function verifiedDownloadFiles(data: Ready, expectedCount: number): ReadyFile[] {
  const files = data.downloads ?? (data.downloadUrl ? [data as ReadyFile] : []);
  if (!data.verified || data.photoCount !== expectedCount || files.length !== 1 ||
      files.some(file => !file.verified || file.photoCount < 1 || file.bytes <= 22 || !file.downloadUrl?.startsWith('https://') || !Number.isFinite(file.expiresAt) || file.expiresAt <= Date.now()) ||
      files.reduce((sum, file) => sum + file.photoCount, 0) !== expectedCount) {
    throw new Error('The complete download could not be verified. Please refresh the gallery or contact us.');
  }
  return files;
}

/** Fetch small preparation JSON, never collect a multi-GB ZIP in browser RAM. */
export function PreparedPhotoDownload({ photoCount, children }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [ready, setReady] = React.useState<Ready | null>(null);
  const [files, setFiles] = React.useState<ReadyFile[]>([]);
  const [error, setError] = React.useState('');
  const controller = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => controller.current?.abort(), []);

  async function prepare(event: React.MouseEvent<HTMLAnchorElement>) {
    if (ready && ready.expiresAt > Date.now()) return;
    event.preventDefault();
    if (controller.current) return;
    setReady(null); setFiles([]); setBusy(true); setError('');
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
      const verified = verifiedDownloadFiles(data, photoCount);
      setFiles(verified);
      setReady({ ...data, expiresAt: Math.min(...verified.map(file => file.expiresAt)) });
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not prepare the download.');
    } finally {
      controller.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return <div className="max-w-sm space-y-2">
    {React.cloneElement(children, {
      href: files[0]?.downloadUrl ?? children.props.href,
      download: files[0]?.filename ?? true,
      onClick: prepare,
      'aria-disabled': busy || undefined,
      'aria-busy': busy || undefined,
      children: busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing ZIP...</>
        : children.props.children,
    })}
    {busy && <p role="status" className="text-xs leading-relaxed text-slate-500">Preparing and checking all {photoCount} photos. Large galleries may take a few minutes. Please keep this page open.</p>}
    {ready && files.length === 1 && <p role="status" className="text-xs leading-relaxed text-emerald-700">Your complete ZIP is ready. Tap the download button again to save it.</p>}
    {error && <p role="alert" className="text-xs leading-relaxed text-rose-700">{error}</p>}
  </div>;
}
