'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCw,
  GitCompareArrows,
  Loader2,
  Save,
  Trash2,
  Camera,
  Send,
} from 'lucide-react';
import type { Photo } from '@/lib/supabase/database.types';

// Pipeline option shape — kept narrow so the viewer doesn't import server code.
interface AdjustOptions {
  exposure: number;
  contrast: number;
  temp: number;
  tint: number;
  saturation: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  sharpening: number;
}

// Named presets matching ENHANCE_PRESETS in the server pipeline. Keeping them
// duplicated client-side avoids a fetch on viewer open.
const PRESETS: Record<string, Partial<AdjustOptions>> = {
  signature: {
    exposure: 0.1, contrast: 0.15, temp: 0, saturation: 0.1,
    highlights: 0.4, shadows: 0.55, whites: 0.05, blacks: -0.05, sharpening: 0.3,
  },
  natural: {
    exposure: 0, contrast: 0, temp: 0, saturation: 0,
    highlights: 0.25, shadows: 0.25, whites: 0, blacks: 0, sharpening: 0.2,
  },
  airy: {
    exposure: 0.3, contrast: -0.1, temp: -0.1, saturation: 0.05,
    highlights: 0.55, shadows: 0.7, whites: 0.1, blacks: -0.1, sharpening: 0.25,
  },
  crisp: {
    exposure: 0, contrast: 0.4, temp: 0.05, saturation: -0.05,
    highlights: 0.5, shadows: 0.45, whites: 0.05, blacks: 0.1, sharpening: 0.55,
  },
  // Deliberate golden-hour warmth — the one preset where a warm cast is the point.
  gold: {
    exposure: 0.15, contrast: 0.1, temp: 0.25, saturation: 0.15,
    highlights: 0.35, shadows: 0.5, whites: 0, blacks: -0.05, sharpening: 0.3,
  },
};

const ZERO: AdjustOptions = {
  exposure: 0, contrast: 0, temp: 0, tint: 0, saturation: 0,
  highlights: 0, shadows: 0, whites: 0, blacks: 0, sharpening: 0.25,
};

interface PhotoViewerProps {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  urls: Record<string, string | null>;
  onPhotosChanged: () => void;
}

/**
 * Fullscreen editor: large preview area with prev/next, a
 * permanent right sidebar with sectioned sliders + preset profiles + aspect
 * ratio, a bottom filmstrip for quick navigation, and an AI revision input
 * along the bottom of the preview area.
 *
 * Keyboard: Esc / ← → / Space (before-after) / +/− (zoom).
 */
export function PhotoViewer({
  photos,
  index,
  onClose,
  onIndexChange,
  urls,
  onPhotosChanged,
}: PhotoViewerProps) {
  const photo = photos[index];
  const [mode, setMode] = useState<'fit' | 'zoom'>('fit');
  const [showBefore, setShowBefore] = useState(false);
  const [parentUrl, setParentUrl] = useState<string | null>(null);
  const [parentFetching, setParentFetching] = useState(false);
  // Full-resolution URL for the current photo. The grids populate `urls` with
  // small thumbnails (for memory), so the loupe fetches the full image itself.
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'rotate' | 'save' | 'ai'>(null);
  const [error, setError] = useState<string | null>(null);

  // Adjustment state — all 10 sliders + sharpening
  const [adjust, setAdjust] = useState<AdjustOptions>(ZERO);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Live-preview output bytes from /api/enhance/preview
  const [previewB64, setPreviewB64] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // AI revision prompt
  const [aiPrompt, setAiPrompt] = useState('');

  const hasParent = Boolean(photo?.parent_photo_id);

  // Fetch the raw "before" URL for the compare toggle
  useEffect(() => {
    setShowBefore(false);
    setParentUrl(null);
    setError(null);
    setPreviewB64(null);
    if (!photo?.parent_photo_id) return;
    setParentFetching(true);
    fetch(`/api/photo-url?photo_id=${photo.parent_photo_id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.url) setParentUrl(d.url);
        else setError(`Couldn't load original: ${d.error || 'no url'}`);
      })
      .catch((err) => setError(`Couldn't load original: ${err?.message || err}`))
      .finally(() => setParentFetching(false));
  }, [photo?.id, photo?.parent_photo_id]);

  // Fetch the full-resolution image for the current photo (grids only cache
  // thumbnails). The thumbnail shows instantly underneath while this loads.
  useEffect(() => {
    setFullUrl(null);
    if (!photo?.id) return;
    let cancelled = false;
    fetch(`/api/photo-url?photo_id=${photo.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.url) setFullUrl(d.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo?.id]);

  // Reset slider state when navigating
  useEffect(() => {
    setAdjust(ZERO);
    setActivePreset(null);
    setPreviewB64(null);
  }, [photo?.id]);

  // Prefer the full-res image; fall back to the cached thumbnail so something
  // shows instantly while the full image downloads.
  const url = photo ? fullUrl ?? urls[photo.id] : null;
  const displayUrl = previewB64
    ? `data:image/jpeg;base64,${previewB64}`
    : showBefore && parentUrl
    ? parentUrl
    : url;

  const next = useCallback(() => {
    if (index < photos.length - 1) onIndexChange(index + 1);
  }, [index, photos.length, onIndexChange]);
  const prev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  // Lock background scroll while the full-screen editor is open so the page
  // behind it can't scroll under the overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack keys while user is typing in the AI prompt field
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') {
        e.preventDefault();
        if (hasParent) setShowBefore((s) => !s);
      } else if (e.key === '+' || e.key === '=') setMode('zoom');
      else if (e.key === '-' || e.key === '_') setMode('fit');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, next, prev, hasParent]);

  // ── Debounced live preview ────────────────────────────────────────────────
  // Whenever the slider state changes (and isn't all zeros), fire the preview
  // 450ms after the last edit. Empty/zero state shows the original.
  const adjustKey = useMemo(() => JSON.stringify(adjust), [adjust]);
  const debouncedRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!photo) return;
    if (debouncedRef.current) clearTimeout(debouncedRef.current);

    const hasAny = Object.values(adjust).some((v) => Math.abs(v) > 0.005);
    if (!hasAny) {
      setPreviewB64(null);
      return;
    }

    debouncedRef.current = setTimeout(async () => {
      setPreviewing(true);
      try {
        const r = await fetch('/api/enhance/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ photo_id: photo.id, options: adjust }),
        });
        if (r.ok) {
          const data = await r.json();
          setPreviewB64(data.preview_b64);
        }
      } catch {
        // best-effort
      } finally {
        setPreviewing(false);
      }
    }, 450);
    return () => {
      if (debouncedRef.current) clearTimeout(debouncedRef.current);
    };
  }, [photo, adjustKey]);

  function setSlider<K extends keyof AdjustOptions>(key: K, value: AdjustOptions[K]) {
    setAdjust((prev) => ({ ...prev, [key]: value }));
    setActivePreset(null);
  }

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    if (!preset) return;
    setAdjust({ ...ZERO, ...preset });
    setActivePreset(name);
  }

  function resetAll() {
    setAdjust(ZERO);
    setActivePreset(null);
    setPreviewB64(null);
  }

  async function save() {
    if (!photo) return;
    setBusy('save');
    setError(null);
    try {
      const r = await fetch('/api/photos/adjust', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photo_id: photo.id, options: adjust }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || 'save_failed');
        return;
      }
      onPhotosChanged();
    } finally {
      setBusy(null);
    }
  }

  async function rotate(degrees: 90 | -90 | 180) {
    if (!photo) return;
    setBusy('rotate');
    setError(null);
    try {
      const r = await fetch('/api/photos/rotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photo_id: photo.id, degrees }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || 'rotate_failed');
      } else {
        onPhotosChanged();
      }
    } finally {
      setBusy(null);
    }
  }

  function download() {
    if (!url) return;
    window.open(url, '_blank');
  }

  async function sendAiPrompt() {
    if (!photo || !aiPrompt.trim()) return;
    setBusy('ai');
    setError(null);
    try {
      // Re-run the enhance pipeline with the user's prompt appended.
      const r = await fetch('/api/ai/process', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: photo.order_id,
          job_type: 'enhance_single',
          provider: 'openai-gpt-image',
          photo_ids: [photo.parent_photo_id ?? photo.id],
          prompt_extra: aiPrompt.trim(),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || 'ai_failed');
      } else {
        setAiPrompt('');
        onPhotosChanged();
      }
    } finally {
      setBusy(null);
    }
  }

  const sizeLabel = useMemo(() => {
    if (!photo?.width || !photo?.height) return '';
    const mb = ((photo.byte_size ?? 0) / 1024 / 1024).toFixed(1);
    return `${photo.width} × ${photo.height} · ${mb} MB`;
  }, [photo]);

  if (!photo) return null;
  // Portal to <body> so the overlay escapes any transformed/overflow-clipped
  // ancestor — otherwise `fixed inset-0` is captured by that ancestor and the
  // editor renders taller than the viewport (you'd have to scroll to reach the
  // top bar / filmstrip). dvh keeps it correct under mobile browser chrome.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 h-[100dvh] w-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* ─── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{photo.filename}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {photo.kind === 'processed' ? 'Processed' : 'Raw'} · {photo.ai_provider ?? 'no AI'} · {sizeLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasParent && (
            <button
              onClick={() => setShowBefore((s) => !s)}
              disabled={!parentUrl}
              title={parentFetching ? 'Loading original…' : 'Toggle before / after (Space)'}
              className={`p-1.5 rounded text-sm transition ${
                showBefore ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-700'
              } disabled:opacity-40`}
            >
              {parentFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompareArrows className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={() => rotate(-90)}
            disabled={busy === 'rotate'}
            title="Rotate left"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-700 disabled:opacity-40"
          >
            <RotateCw className="h-4 w-4 -scale-x-100" />
          </button>
          <button
            onClick={() => rotate(90)}
            disabled={busy === 'rotate'}
            title="Rotate right"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-700 disabled:opacity-40"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            onClick={download}
            title="Open in new tab"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={save}
            disabled={busy === 'save' || !previewB64}
            title={previewB64 ? 'Save as new version' : 'Adjust sliders to enable Save'}
            className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-ocean-600 text-white text-sm font-medium hover:bg-ocean-500 disabled:opacity-40"
          >
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>

      {/* ─── Main area: image + sidebar ────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">
        {/* Image canvas */}
        <div className="flex-1 min-w-0 relative bg-slate-100 grid place-items-center overflow-hidden">
          {/* Prev / next */}
          {index > 0 && (
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 hover:bg-white p-2 shadow z-10"
              aria-label="Previous"
            >
              <ChevronLeft className="h-5 w-5 text-slate-700" />
            </button>
          )}
          {index < photos.length - 1 && (
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 hover:bg-white p-2 shadow z-10"
              aria-label="Next"
            >
              <ChevronRight className="h-5 w-5 text-slate-700" />
            </button>
          )}

          {/* The photo itself */}
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt={photo.filename}
              className="max-h-full max-w-full object-contain select-none"
              draggable={false}
            />
          ) : (
            <div className="text-slate-400">Loading…</div>
          )}

          {showBefore && parentUrl && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-xs px-2 py-0.5 rounded shadow z-10 font-medium">
              BEFORE
            </div>
          )}

          {previewing && (
            <div className="absolute top-3 right-3 bg-slate-900/80 text-white text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Rendering preview
            </div>
          )}

          {/* AI revision prompt — anchored bottom */}
          <div className="absolute inset-x-6 bottom-4 flex items-center gap-2 bg-white rounded-full shadow-lg px-3 py-1.5 z-10">
            <button
              onClick={() => setAiPrompt('')}
              className="text-slate-400 hover:text-slate-600 px-1"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendAiPrompt();
              }}
              placeholder="Describe changes for AI revision…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400"
            />
            <button
              onClick={sendAiPrompt}
              disabled={busy === 'ai' || !aiPrompt.trim()}
              className="h-7 w-7 grid place-items-center rounded-full bg-ocean-600 text-white hover:bg-ocean-500 disabled:opacity-40"
            >
              {busy === 'ai' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* ─── Right sidebar ─────────────────────────────────────────────── */}
        <aside className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Presets */}
            <SidebarSection title="Profiles">
              <div className="grid grid-cols-5 gap-1.5">
                {(['signature', 'natural', 'airy', 'crisp', 'gold'] as const).map((name) => (
                  <button
                    key={name}
                    onClick={() => applyPreset(name)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-md text-[11px] transition ${
                      activePreset === name
                        ? 'bg-ocean-50 ring-1 ring-ocean-500 text-ocean-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Camera className="h-5 w-5" strokeWidth={1.5} />
                    <span className="capitalize">{name}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={resetAll}
                className="mt-2 w-full text-[11px] text-slate-500 hover:text-slate-700 inline-flex items-center justify-center gap-1 py-1"
              >
                <Trash2 className="h-3 w-3" /> Reset all
              </button>
            </SidebarSection>

            <SidebarSection title="Basic">
              <Slider label="Exposure" value={adjust.exposure} min={-2} max={2} step={0.05} onChange={(v) => setSlider('exposure', v)} />
              <Slider label="Contrast" value={adjust.contrast} min={-1} max={1} step={0.02} onChange={(v) => setSlider('contrast', v)} />
            </SidebarSection>

            <SidebarSection title="Color">
              <Slider label="Temp" value={adjust.temp} min={-1} max={1} step={0.02} onChange={(v) => setSlider('temp', v)} />
              <Slider label="Tint" value={adjust.tint} min={-1} max={1} step={0.02} onChange={(v) => setSlider('tint', v)} />
              <Slider label="Saturation" value={adjust.saturation} min={-1} max={1} step={0.02} onChange={(v) => setSlider('saturation', v)} />
            </SidebarSection>

            <SidebarSection title="Tone">
              <Slider label="Highlights" value={adjust.highlights} min={-1} max={1} step={0.02} onChange={(v) => setSlider('highlights', v)} />
              <Slider label="Shadows" value={adjust.shadows} min={-1} max={1} step={0.02} onChange={(v) => setSlider('shadows', v)} />
              <Slider label="Whites" value={adjust.whites} min={-1} max={1} step={0.02} onChange={(v) => setSlider('whites', v)} />
              <Slider label="Blacks" value={adjust.blacks} min={-1} max={1} step={0.02} onChange={(v) => setSlider('blacks', v)} />
            </SidebarSection>

            <SidebarSection title="Detail">
              <Slider label="Sharpening" value={adjust.sharpening} min={0} max={1} step={0.02} onChange={(v) => setSlider('sharpening', v)} />
            </SidebarSection>

            {error && (
              <div className="text-xs text-rose-700 bg-rose-50 rounded px-2 py-1.5">{error}</div>
            )}
          </div>
        </aside>
      </div>

      {/* ─── Bottom filmstrip ──────────────────────────────────────────────── */}
      <Filmstrip
        photos={photos}
        index={index}
        urls={urls}
        onSelect={onIndexChange}
      />
    </div>,
    document.body
  );
}

// ─── Sidebar pieces ────────────────────────────────────────────────────────
function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-700">{label}</span>
        <span className="text-[11px] font-mono text-slate-500">
          {value > 0 ? '+' : ''}
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full mt-1 accent-ocean-600"
      />
    </div>
  );
}

// ─── Filmstrip ─────────────────────────────────────────────────────────────
function Filmstrip({
  photos,
  index,
  urls,
  onSelect,
}: {
  photos: Photo[];
  index: number;
  urls: Record<string, string | null>;
  onSelect: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Scroll the active thumbnail into view when the index changes
  useEffect(() => {
    const node = ref.current?.querySelector(`[data-filmstrip-index="${index}"]`);
    if (node && 'scrollIntoView' in node) {
      (node as HTMLElement).scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [index]);

  return (
    <div className="border-t border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
      <button
        onClick={() => onSelect(Math.max(0, index - 1))}
        disabled={index === 0}
        className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4 text-slate-600" />
      </button>
      <div
        ref={ref}
        className="flex-1 flex gap-1.5 overflow-x-auto py-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {photos.map((p, i) => {
          const u = urls[p.id];
          const active = i === index;
          return (
            <button
              key={p.id}
              data-filmstrip-index={i}
              onClick={() => onSelect(i)}
              className={`shrink-0 h-14 aspect-square overflow-hidden rounded ring-2 transition ${
                active ? 'ring-ocean-600' : 'ring-transparent hover:ring-slate-300'
              }`}
            >
              {u ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u} alt={p.filename} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-slate-200 grid place-items-center text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onSelect(Math.min(photos.length - 1, index + 1))}
        disabled={index === photos.length - 1}
        className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4 text-slate-600" />
      </button>
    </div>
  );
}
