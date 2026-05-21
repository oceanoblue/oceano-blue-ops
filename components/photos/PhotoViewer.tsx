'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCw,
  Wand2,
  GitCompareArrows,
  ZoomIn,
  ZoomOut,
  Loader2,
  Sliders,
  Save,
} from 'lucide-react';
import type { Photo } from '@/lib/supabase/database.types';

type Mode = 'fit' | 'zoom';

interface PhotoViewerProps {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  /** Map of photo_id → signed URL (already fetched by the parent). */
  urls: Record<string, string | null>;
  /** Called after a successful rotate / re-run so the parent can refresh. */
  onPhotosChanged: () => void;
}

/**
 * Fullscreen photo viewer with prev/next, zoom toggle, before/after compare,
 * rotate, download, and a quick re-enhance button. Keyboard:
 *   - Esc      close
 *   - ← / →    prev / next
 *   - Space    toggle compare
 *   - +/-      zoom in/out
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
  const [mode, setMode] = useState<Mode>('fit');
  const [showBefore, setShowBefore] = useState(false);
  const [parentUrl, setParentUrl] = useState<string | null>(null);
  const [parentFetching, setParentFetching] = useState(false);
  const [busy, setBusy] = useState<null | 'rotate' | 'rerun' | 'save'>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Adjustment panel state ────────────────────────────────────────────────
  // When the user opens the sliders, we keep a "pending" set of options and
  // debounce-fire /api/enhance/preview for live feedback. Saving applies them
  // via /api/photos/adjust which creates a new processed photo.
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [shadowLift, setShadowLift] = useState(0.55);
  const [highlightRecover, setHighlightRecover] = useState(0.55);
  const [vibrance, setVibrance] = useState(0.3);
  const [previewB64, setPreviewB64] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const hasParent = Boolean(photo?.parent_photo_id);

  // Fetch the raw "before" URL when looking at a processed photo
  useEffect(() => {
    setShowBefore(false);
    setParentUrl(null);
    setError(null);
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

  const url = photo ? urls[photo.id] : null;
  // Priority: live preview from the slider panel > before-toggle > the actual
  // signed URL. The live preview is a base64 string so it doesn't need any
  // network fetch to display.
  const displayUrl = previewB64
    ? `data:image/jpeg;base64,${previewB64}`
    : showBefore && parentUrl
    ? parentUrl
    : url;

  // Reset preview when navigating to a different photo
  useEffect(() => {
    setPreviewB64(null);
  }, [photo?.id]);

  // Debounced preview: 450ms after the last slider change, hit the preview API
  // and update the displayed image. We always re-render from the source so
  // successive slider movements don't compound.
  useEffect(() => {
    if (!adjustOpen || !photo) return;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const r = await fetch('/api/enhance/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            photo_id: photo.id,
            options: { shadowLift, highlightRecover, vibrance },
          }),
        });
        if (r.ok) {
          const data = await r.json();
          setPreviewB64(data.preview_b64);
        }
      } catch {
        // ignore — preview is best-effort, sliders still move
      } finally {
        setPreviewing(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [adjustOpen, photo, shadowLift, highlightRecover, vibrance]);

  async function saveAdjustment() {
    if (!photo) return;
    setBusy('save');
    setError(null);
    try {
      const r = await fetch('/api/photos/adjust', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          photo_id: photo.id,
          options: { shadowLift, highlightRecover, vibrance },
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || 'save_failed');
        return;
      }
      setAdjustOpen(false);
      setPreviewB64(null);
      onPhotosChanged();
    } finally {
      setBusy(null);
    }
  }

  function resetAdjustments() {
    setShadowLift(0.55);
    setHighlightRecover(0.55);
    setVibrance(0.3);
  }

  const next = useCallback(() => {
    if (index < photos.length - 1) onIndexChange(index + 1);
  }, [index, photos.length, onIndexChange]);
  const prev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
        return;
      }
      onPhotosChanged();
    } finally {
      setBusy(null);
    }
  }

  async function rerun() {
    if (!photo) return;
    setBusy('rerun');
    setError(null);
    try {
      // Re-enhance using the raw parent (or this photo if it's already raw).
      const targetId = photo.parent_photo_id ?? photo.id;
      const r = await fetch('/api/ai/process', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: photo.order_id,
          job_type: 'enhance_single',
          provider: 'oceano-enhance',
          photo_ids: [targetId],
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || 'rerun_failed');
        return;
      }
      onPhotosChanged();
    } finally {
      setBusy(null);
    }
  }

  function download() {
    if (!url) return;
    // Open in a new tab — the signed URL will trigger the browser save dialog
    // because we set content-disposition on upload (storage default).
    window.open(url, '_blank');
  }

  const sizeLabel = useMemo(() => {
    if (!photo?.width || !photo?.height) return '';
    const mb = ((photo.byte_size ?? 0) / 1024 / 1024).toFixed(1);
    return `${photo.width} × ${photo.height} · ${mb} MB`;
  }, [photo]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 text-white flex flex-col"
      onClick={(e) => {
        // Click on the dim backdrop closes; clicks on toolbar / image don't.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{photo.filename}</div>
          <div className="text-xs text-white/60">
            {photo.kind === 'processed' ? 'Processed' : 'Raw'} ·{' '}
            {photo.ai_provider ?? 'no AI'} · {sizeLabel}
            {photo.ai_prompt && ` · ${photo.ai_prompt.slice(0, 60)}`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ToolbarBtn
            onClick={() => setMode((m) => (m === 'fit' ? 'zoom' : 'fit'))}
            tip={mode === 'fit' ? 'Zoom in (+)' : 'Fit (–)'}
          >
            {mode === 'fit' ? <ZoomIn className="h-4 w-4" /> : <ZoomOut className="h-4 w-4" />}
          </ToolbarBtn>
          {hasParent && (
            <ToolbarBtn
              onClick={() => setShowBefore((s) => !s)}
              tip={
                parentFetching
                  ? 'Loading original…'
                  : parentUrl
                  ? 'Toggle before / after (Space)'
                  : 'Original unavailable'
              }
              active={showBefore}
              disabled={!parentUrl}
            >
              {parentFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GitCompareArrows className="h-4 w-4" />
              )}
            </ToolbarBtn>
          )}
          <ToolbarBtn onClick={() => rotate(-90)} tip="Rotate left" disabled={busy === 'rotate'}>
            <RotateCw className="h-4 w-4 -scale-x-100" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => rotate(90)} tip="Rotate right" disabled={busy === 'rotate'}>
            <RotateCw className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => setAdjustOpen((o) => !o)}
            tip={adjustOpen ? 'Close adjustments' : 'Open adjustments'}
            active={adjustOpen}
          >
            <Sliders className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={rerun} tip="Re-run Oceano Enhance" disabled={busy === 'rerun'}>
            {busy === 'rerun' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </ToolbarBtn>
          <ToolbarBtn onClick={download} tip="Open in new tab">
            <Download className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={onClose} tip="Close (Esc)">
            <X className="h-4 w-4" />
          </ToolbarBtn>
        </div>
      </div>

      {/* Image area. min-h-0 lets the flex child actually shrink to the
          remaining viewport instead of growing to its natural content size. */}
      <div
        className={`flex-1 min-h-0 relative ${
          mode === 'zoom' ? 'overflow-auto' : 'overflow-hidden'
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Prev / next */}
        {index > 0 && (
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 z-10"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 z-10"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {displayUrl ? (
          mode === 'fit' ? (
            // Fit mode: full-bleed flex centering so the image is constrained
            // to viewport regardless of its natural pixel size.
            <div
              className="absolute inset-0 flex items-center justify-center p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayUrl}
                alt={photo.filename}
                className="max-h-full max-w-full object-contain cursor-zoom-in select-none"
                onClick={() => setMode('zoom')}
                draggable={false}
              />
            </div>
          ) : (
            // Zoom mode: render at natural size; parent has overflow-auto so
            // the user can scroll around. Padding keeps the image clear of
            // the prev/next buttons.
            <div className="min-h-full min-w-full flex items-start justify-start p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayUrl}
                alt={photo.filename}
                className="block max-w-none cursor-zoom-out select-none"
                onClick={() => setMode('fit')}
                draggable={false}
              />
            </div>
          )
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/60">Loading…</div>
        )}

        {showBefore && parentUrl && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-xs px-2 py-1 rounded shadow z-10">
            BEFORE
          </div>
        )}

        {/* Adjustments side panel — slides in from the right when toggled.
            Sits inside the image area so it overlays without resizing the photo. */}
        {adjustOpen && (
          <div
            className="absolute top-0 right-0 bottom-0 w-72 bg-slate-900/95 border-l border-white/10 p-5 overflow-y-auto z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Adjustments</h3>
              {previewing && <Loader2 className="h-3 w-3 animate-spin text-white/60" />}
            </div>

            <AdjustSlider
              label="Shadow lift"
              hint="Brighten dark areas"
              value={shadowLift}
              onChange={setShadowLift}
            />
            <AdjustSlider
              label="Highlight recovery"
              hint="Pull blown windows back"
              value={highlightRecover}
              onChange={setHighlightRecover}
            />
            <AdjustSlider
              label="Vibrance"
              hint="Saturate muted colors"
              value={vibrance}
              onChange={setVibrance}
            />

            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={saveAdjustment}
                disabled={busy === 'save'}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-ocean-600 text-white text-sm font-medium hover:bg-ocean-500 disabled:opacity-60"
              >
                {busy === 'save' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save as new version
              </button>
              <button
                onClick={resetAdjustments}
                className="w-full px-3 py-1.5 rounded-md bg-white/10 text-white/80 text-xs hover:bg-white/20"
              >
                Reset to defaults
              </button>
            </div>

            <p className="mt-4 text-[11px] text-white/40 leading-tight">
              Live preview re-renders 450 ms after you stop dragging. Saving
              re-runs the deterministic pipeline against the raw source and
              creates a new processed photo — your originals stay untouched.
            </p>
          </div>
        )}
      </div>

      {/* Bottom strip */}
      <div className="px-4 py-2 text-xs text-white/60 flex items-center justify-between border-t border-white/10">
        <span>
          {index + 1} / {photos.length}
        </span>
        <span>
          ←/→ navigate · Space compare · +/− zoom · Esc close
        </span>
        {error && <span className="text-rose-300">{error}</span>}
      </div>
    </div>
  );
}

function AdjustSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-white/90">{label}</label>
        <span className="text-[11px] font-mono text-white/60">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full mt-1 accent-ocean-500"
      />
      <p className="text-[10px] text-white/40 mt-0.5">{hint}</p>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  tip,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tip: string;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tip}
      className={`p-2 rounded hover:bg-white/10 disabled:opacity-40 ${
        active ? 'bg-white/20' : ''
      }`}
    >
      {children}
    </button>
  );
}
