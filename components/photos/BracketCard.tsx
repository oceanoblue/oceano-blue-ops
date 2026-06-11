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
 * Visual representation of a detected HDR bracket. Shows up to 3 mini
 * thumbnails stacked horizontally inside one card.
 *
 * For RAW brackets we can't render the ARW bytes directly in the browser,
 * so we fetch the embedded camera-JPEG preview from the worker for the
 * MIDDLE (0 EV) frame and display it across all three thumbnail slots. The
 * other frames stay as placeholder camera icons — the middle frame is the
 * one the photographer cares about for triage anyway.
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

  // For non-RAW frames in the bracket, pre-fetch the regular signed URLs.
  useEffect(() => {
    for (const p of bracket.photos.slice(0, 3)) {
      if (isRawFilename(p.filename)) continue;
      if (urls[p.id] !== undefined) continue;
      fetch(`/api/photo-url?photo_id=${p.id}`)
        .then((r) => r.json())
        .then((d) => setUrls((u) => ({ ...u, [p.id]: d.url ?? null })))
        .catch(() => setUrls((u) => ({ ...u, [p.id]: null })));
    }
  }, [bracket.photos, urls, setUrls]);

  // For all-RAW brackets, lazy-load the embedded-JPEG preview of the middle
  // frame from the RAW worker. If the worker isn't reachable/configured in
  // this deployment, give up after a short timeout and fall back to the RAW
  // placeholder rather than spinning until the route's 60s limit.
  useEffect(() => {
    if (!allRaw) return;
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
  }, [allRaw, middleFrame.id]);

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

  // If we have a RAW preview, render it once spanning the full strip area
  // so it actually reads as a photo. If not, fall back to per-frame tiles.
  const showFullPreview = allRaw && rawPreviewUrl;

  return (
    <div
      onClick={onToggle}
      className={`group relative rounded-lg overflow-hidden ring-2 transition cursor-pointer bg-slate-900 ${
        selected ? 'ring-ocean-600' : 'ring-transparent hover:ring-slate-300'
      }`}
    >
      {/* Thumbnail strip */}
      {showFullPreview ? (
        <div className="relative aspect-[3/2] bg-slate-800 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={rawPreviewUrl!}
            alt={middleFrame.filename}
            className="h-full w-full object-cover"
          />
          {/* Frame count badge top-right */}
          <div className="absolute bottom-1 right-1 text-[10px] font-mono bg-black/60 text-white px-1.5 py-0.5 rounded">
            {bracket.photos.length} frames
          </div>
        </div>
      ) : (
        <div className="flex gap-px bg-slate-900">
          {bracket.photos.slice(0, 3).map((p) => {
            const url = urls[p.id];
            const raw = isRawFilename(p.filename);
            return (
              <div
                key={p.id}
                className="flex-1 aspect-square bg-slate-800 grid place-items-center overflow-hidden"
              >
                {raw ? (
                  previewLoading ? (
                    <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-slate-500" strokeWidth={1.5} />
                  )
                ) : url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={p.filename} className="h-full w-full object-cover" />
                ) : (
                  <div className="text-[10px] text-slate-500">…</div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
