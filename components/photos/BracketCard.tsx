'use client';

import { useEffect } from 'react';
import { Sparkles, Camera } from 'lucide-react';
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
 * thumbnails stacked horizontally inside one card, with the count of
 * additional shots if there are more (e.g., 5-shot bracket displays "+2").
 */
export function BracketCard({ bracket, selected, onToggle, urls, setUrls }: BracketCardProps) {
  // Pre-fetch URLs for the photos that will be visible. We don't try to render
  // RAW thumbnails because the browser can't, so RAW brackets show camera-icon
  // tiles instead.
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

  const first = bracket.photos[0];
  const last = bracket.photos[bracket.photos.length - 1];
  const sizeBytes = bracket.photos.reduce((sum, p) => sum + (p.byte_size ?? 0), 0);
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(0);
  const allRaw = bracket.photos.every((p) => isRawFilename(p.filename));
  const ext = (first.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase();

  // Compact range display: "OBM03879–OBM03881"
  const stripExt = (s: string) => s.replace(/\.[^.]+$/, '');
  const rangeLabel =
    bracket.photos.length > 1 ? `${stripExt(first.filename)}–${stripExt(last.filename)}` : stripExt(first.filename);

  return (
    <div
      onClick={onToggle}
      className={`group relative rounded-lg overflow-hidden ring-2 transition cursor-pointer bg-slate-900 ${
        selected ? 'ring-ocean-600' : 'ring-transparent hover:ring-slate-300'
      }`}
    >
      {/* Three-thumbnail strip */}
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
                <Camera className="h-5 w-5 text-slate-500" strokeWidth={1.5} />
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

      {/* Selection checkbox — always visible */}
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
