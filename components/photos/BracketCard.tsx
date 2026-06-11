'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Camera, Loader2 } from 'lucide-react';
import type { BracketGroup } from '@/lib/photos/bracket-grouping';
import { isRawFilename } from '@/lib/photos/bracket-grouping';

interface BracketCardProps {
  bracket: BracketGroup;
  selected: boolean;
  onToggle: () => void;
  urls: Record<string, string | null>;
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
}

/**
 * Visual representation of a detected HDR bracket: ONE hero thumbnail (the
 * middle / 0 EV frame — the one that matters for triage) with an "N frames"
 * count badge. Consistent for RAW and JPEG brackets:
 *   - JPEG middle frame → regular signed URL
 *   - RAW middle frame  → embedded camera-JPEG preview from the worker
 */
export function BracketCard({ bracket, selected, onToggle, urls, setUrls }: BracketCardProps) {
  // RAW preview state — separate from the JPEG `urls` cache because the
  // preview JPEG is a derived asset (camera-embedded thumbnail), not the
  // file itself.
  const [rawPreviewUrl, setRawPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Guard so we attempt the preview exactly once per frame — a failed fetch
  // must NOT re-fire (that loop was hammering the endpoint and spinning forever).
  const previewTriedRef = useRef<string | null>(null);

  const allRaw = bracket.photos.every((p) => isRawFilename(p.filename));
  const middleFrame = bracket.photos[Math.floor(bracket.photos.length / 2)] ?? bracket.photos[0];
  const middleIsRaw = isRawFilename(middleFrame.filename);

  // JPEG middle frame → fetch its regular signed URL.
  useEffect(() => {
    if (middleIsRaw) return;
    if (urls[middleFrame.id] !== undefined) return;
    fetch(`/api/photo-url?photo_id=${middleFrame.id}`)
      .then((r) => r.json())
      .then((d) => setUrls((u) => ({ ...u, [middleFrame.id]: d.url ?? null })))
      .catch(() => setUrls((u) => ({ ...u, [middleFrame.id]: null })));
  }, [middleFrame.id, middleIsRaw, urls, setUrls]);

  // RAW middle frame → lazy-load the embedded-JPEG preview from the worker.
  // If the worker isn't reachable/configured, give up after a short timeout
  // and fall back to the camera placeholder rather than spinning forever.
  useEffect(() => {
    if (!middleIsRaw) return;
    // Only one attempt per middle frame, regardless of re-renders.
    if (previewTriedRef.current === middleFrame.id) return;
    previewTriedRef.current = middleFrame.id;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setPreviewLoading(true);
    // Fetch the preview, retrying once on a 401. Two bracket cards fire their
    // previews at the same time; on an aging session that pair of concurrent
    // requests can race Supabase's token refresh and one comes back 401. By the
    // time we retry, the refresh has settled and the cookie is valid again.
    (async () => {
      const get = () =>
        fetch(`/api/raw-thumb?photo_id=${middleFrame.id}`, { signal: controller.signal });
      let r = await get();
      if (r.status === 401) {
        await new Promise((res) => setTimeout(res, 1000));
        if (!cancelled) r = await get();
      }
      const blob = r.ok ? await r.blob() : null;
      if (cancelled || !blob) return;
      setRawPreviewUrl(URL.createObjectURL(blob));
    })()
      .catch(() => {})
      .finally(() => {
        clearTimeout(timeout);
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [middleIsRaw, middleFrame.id]);

  // Release the object URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (rawPreviewUrl) URL.revokeObjectURL(rawPreviewUrl);
    };
  }, [rawPreviewUrl]);

  const first = bracket.photos[0];
  const last = bracket.photos[bracket.photos.length - 1];
  const sizeBytes = bracket.photos.reduce((sum, p) => sum + (p.byte_size ?? 0), 0);
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(0);
  const ext = (first.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase();

  const stripExt = (s: string) => s.replace(/\.[^.]+$/, '');
  const rangeLabel =
    bracket.photos.length > 1 ? `${stripExt(first.filename)}–${stripExt(last.filename)}` : stripExt(first.filename);

  // One consistent hero thumbnail for every bracket: the middle (0 EV) frame.
  const heroUrl = middleIsRaw ? rawPreviewUrl : urls[middleFrame.id] ?? null;
  const heroLoading = middleIsRaw ? previewLoading : urls[middleFrame.id] === undefined;

  return (
    <div
      onClick={onToggle}
      className={`group relative rounded-lg overflow-hidden ring-2 transition cursor-pointer bg-slate-900 ${
        selected ? 'ring-ocean-600' : 'ring-transparent hover:ring-slate-300'
      }`}
    >
      {/* Hero thumbnail + frame-count badge */}
      <div className="relative aspect-[3/2] bg-slate-800 overflow-hidden">
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt={middleFrame.filename} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full grid place-items-center text-slate-500">
            {heroLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            ) : (
              <Camera className="h-6 w-6" strokeWidth={1.5} />
            )}
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5 text-[10px] font-mono bg-black/60 text-white px-1.5 py-0.5 rounded">
          {bracket.photos.length} frames
        </div>
      </div>

      {/* Footer with bracket info */}
      <div className="px-3 py-2.5 bg-slate-50">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <div className="text-xs font-semibold text-slate-900">
            {bracket.detectedSize}-shot bracket
          </div>
          {allRaw && (
            <span className="ml-auto text-[10px] font-mono bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
              {ext}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500 truncate">{rangeLabel}</div>
        <div className="text-[11px] text-slate-400">~{sizeMB} MB</div>
      </div>

      {/* Selection checkbox */}
      <div
        className={`absolute top-2 left-2 h-5 w-5 grid place-items-center rounded border-2 text-[11px] transition ${
          selected
            ? 'bg-ocean-600 border-ocean-600 text-white'
            : 'bg-white/90 border-white/90 text-slate-400'
        }`}
      >
        {selected ? '✓' : ''}
      </div>
    </div>
  );
}
