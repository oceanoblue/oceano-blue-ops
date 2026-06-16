'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, RefreshCw } from 'lucide-react';

export interface EnhanceSettings {
  target_long_edge: number;
  jpeg_quality: number;
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

interface RecentPhoto {
  id: string;
  filename: string;
  order_number: number;
  bucket: string;
  storage_path: string;
}

// Presets fill the sliders; you can still tweak before saving.
const PRESETS: Record<string, Partial<EnhanceSettings>> = {
  'Luxury (default)': {
    exposure: 0.25, contrast: 0.08, temp: 0.0, tint: 0.0, saturation: 0.1,
    highlights: 0.35, shadows: 0.3, whites: 0.0, blacks: -0.03, sharpening: 0.3,
  },
  'Brighter & airier': {
    exposure: 0.35, contrast: 0.06, temp: 0.02, tint: 0.0, saturation: 0.1,
    highlights: 0.4, shadows: 0.4, whites: 0.0, blacks: -0.05, sharpening: 0.3,
  },
  'Warmer & inviting': {
    exposure: 0.25, contrast: 0.08, temp: 0.12, tint: 0.0, saturation: 0.12,
    highlights: 0.35, shadows: 0.3, whites: 0.0, blacks: -0.03, sharpening: 0.3,
  },
  'Natural / understated': {
    exposure: 0.12, contrast: 0.05, temp: 0.02, tint: 0.0, saturation: 0.06,
    highlights: 0.25, shadows: 0.18, whites: 0.0, blacks: 0.0, sharpening: 0.25,
  },
  'More contrast / pop': {
    exposure: 0.2, contrast: 0.18, temp: 0.0, tint: 0.0, saturation: 0.16,
    highlights: 0.3, shadows: 0.22, whites: 0.03, blacks: 0.05, sharpening: 0.35,
  },
};

export function EnhanceSettingsForm({
  initial,
  recent,
}: {
  initial: EnhanceSettings;
  recent: RecentPhoto[];
}) {
  const router = useRouter();
  const [s, setS] = useState<EnhanceSettings>(initial);
  const [pending, start] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [photoId, setPhotoId] = useState<string | null>(recent[0]?.id ?? null);
  const [previewing, setPreviewing] = useState(false);
  const [previewB64, setPreviewB64] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoId) {
      setOriginalUrl(null);
      return;
    }
    fetch(`/api/photo-url?photo_id=${photoId}`)
      .then((r) => r.json())
      .then((d) => setOriginalUrl(d.url ?? null))
      .catch(() => setOriginalUrl(null));
    setPreviewB64(null);
  }, [photoId]);

  function set<K extends keyof EnhanceSettings>(k: K, v: EnhanceSettings[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  function applyPreset(name: string) {
    const p = PRESETS[name];
    if (p) setS((prev) => ({ ...prev, ...p }));
  }

  function save() {
    start(async () => {
      setError(null);
      const supabase = createClient();
      const { error } = await supabase
        .from('oceano_enhance_settings')
        .upsert({ id: true, ...s, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) setError(error.message);
      else {
        setSavedAt(new Date().toLocaleTimeString());
        router.refresh();
      }
    });
  }

  async function runPreview() {
    if (!photoId) return;
    setPreviewing(true);
    setError(null);
    try {
      const r = await fetch('/api/enhance/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          photo_id: photoId,
          options: {
            targetLongEdge: s.target_long_edge,
            jpegQuality: s.jpeg_quality,
            exposure: s.exposure,
            contrast: s.contrast,
            temp: s.temp,
            tint: s.tint,
            saturation: s.saturation,
            highlights: s.highlights,
            shadows: s.shadows,
            whites: s.whites,
            blacks: s.blacks,
            sharpening: s.sharpening,
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'preview_failed');
        return;
      }
      setPreviewB64(data.preview_b64);
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_1fr]">
      <section className="card p-6">
        <h2 className="font-semibold text-ocean-900">Luxury grade</h2>
        <p className="mt-1 text-sm text-slate-600">
          These drive every photo that runs through Oceano Enhance. Tune, preview against a
          real shot, then Save.
        </p>

        <div className="mt-4">
          <label className="label">Preset</label>
          <select
            className="input"
            onChange={(e) => e.target.value && applyPreset(e.target.value)}
            defaultValue=""
          >
            <option value="" disabled>Apply a preset…</option>
            {Object.keys(PRESETS).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="mt-6 space-y-4">
          <Slider label="Exposure" help="Overall brightness (airy lift)." min={-1} max={1}
            value={s.exposure} onChange={(v) => set('exposure', v)} />
          <Slider label="Highlights" help="+ recovers blown windows/exteriors." min={-1} max={1}
            value={s.highlights} onChange={(v) => set('highlights', v)} />
          <Slider label="Shadows" help="+ opens dark corners (airy)." min={-1} max={1}
            value={s.shadows} onChange={(v) => set('shadows', v)} />
          <Slider label="Whites" help="Top of the curve. Keep below clipping." min={-1} max={1}
            value={s.whites} onChange={(v) => set('whites', v)} />
          <Slider label="Blacks" help="− lifts for airy; + deepens for crisp." min={-1} max={1}
            value={s.blacks} onChange={(v) => set('blacks', v)} />
          <Slider label="Contrast" help="Gentle = depth without HDR flatness." min={-1} max={1}
            value={s.contrast} onChange={(v) => set('contrast', v)} />
          <Slider label="Warmth (temp)" help="− cooler, + warmer/inviting." min={-1} max={1}
            value={s.temp} onChange={(v) => set('temp', v)} />
          <Slider label="Tint" help="− green, + magenta. Usually 0." min={-1} max={1}
            value={s.tint} onChange={(v) => set('tint', v)} />
          <Slider label="Saturation" help="Realistic colour — small. Oversaturation looks fake." min={-1} max={1}
            value={s.saturation} onChange={(v) => set('saturation', v)} />
          <Slider label="Sharpening" help="Crisp detail, no crunch." min={0} max={1}
            value={s.sharpening} onChange={(v) => set('sharpening', v)} />

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="label">Long edge (px)</label>
              <input type="number" min={1200} max={6000} step={100} className="input"
                value={s.target_long_edge}
                onChange={(e) => set('target_long_edge', Math.max(1200, +e.target.value))} />
              <p className="mt-1 text-xs text-slate-500">3000 is MLS standard.</p>
            </div>
            <div>
              <label className="label">JPEG quality</label>
              <input type="number" min={60} max={100} className="input"
                value={s.jpeg_quality}
                onChange={(e) => set('jpeg_quality', Math.min(100, Math.max(60, +e.target.value)))} />
              <p className="mt-1 text-xs text-slate-500">92 = pro default.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save grade'}
          </button>
          {savedAt && <span className="text-sm text-emerald-700">Saved {savedAt}</span>}
        </div>
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ocean-900">Live preview</h2>
          <button className="btn-secondary" onClick={runPreview} disabled={!photoId || previewing}>
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {previewing ? 'Rendering…' : 'Re-render'}
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Render a real upload with the current sliders. Nothing is saved here — it&apos;s a
          sandbox. Hit Save grade on the left to apply it to all enhancing.
        </p>

        <div className="mt-4">
          <label className="label">Sample photo</label>
          <select className="input max-w-md" value={photoId ?? ''}
            onChange={(e) => setPhotoId(e.target.value || null)}>
            {recent.length === 0 && <option value="">No recent uploads</option>}
            {recent.map((p) => (
              <option key={p.id} value={p.id}>Order #{p.order_number} — {p.filename}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <PreviewPanel title="Before" url={originalUrl ?? undefined} />
          <PreviewPanel title="After (current grade)" b64={previewB64 ?? undefined}
            placeholder={previewing ? 'Rendering…' : 'Click Re-render to preview.'} />
        </div>
      </section>
    </div>
  );
}

function Slider({
  label, help, value, onChange, min, max,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex justify-between">
        <label className="label">{label}</label>
        <span className="text-xs font-mono text-slate-500">{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={0.01} value={value}
        onChange={(e) => onChange(+e.target.value)} className="w-full" />
      <p className="text-xs text-slate-500">{help}</p>
    </div>
  );
}

function PreviewPanel({
  title, url, b64, placeholder,
}: {
  title: string;
  url?: string;
  b64?: string;
  placeholder?: string;
}) {
  const src = b64 ? `data:image/jpeg;base64,${b64}` : url;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">{title}</div>
      <div className="aspect-[3/2] w-full overflow-hidden rounded-md ring-1 ring-slate-200 bg-slate-50 grid place-items-center">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={title} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-slate-500">{placeholder ?? '—'}</span>
        )}
      </div>
    </div>
  );
}
