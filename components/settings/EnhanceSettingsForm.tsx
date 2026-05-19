'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, RefreshCw } from 'lucide-react';

interface EnhanceSettings {
  target_long_edge: number;
  shadow_lift: number;
  highlight_recover: number;
  vibrance: number;
  jpeg_quality: number;
}

interface RecentPhoto {
  id: string;
  filename: string;
  order_number: number;
  bucket: string;
  storage_path: string;
}

const PRESETS: Record<string, Partial<EnhanceSettings>> = {
  'Default (balanced)': {
    shadow_lift: 0.35,
    highlight_recover: 0.4,
    vibrance: 0.15,
    target_long_edge: 3000,
    jpeg_quality: 92,
  },
  'Bright & airy': {
    shadow_lift: 0.55,
    highlight_recover: 0.55,
    vibrance: 0.1,
    target_long_edge: 3000,
    jpeg_quality: 92,
  },
  'Natural / understated': {
    shadow_lift: 0.2,
    highlight_recover: 0.3,
    vibrance: 0.08,
    target_long_edge: 3000,
    jpeg_quality: 92,
  },
  'High contrast (luxury)': {
    shadow_lift: 0.45,
    highlight_recover: 0.55,
    vibrance: 0.22,
    target_long_edge: 4000,
    jpeg_quality: 94,
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

  function applyPreset(name: string) {
    const p = PRESETS[name];
    if (p) setS({ ...s, ...p } as EnhanceSettings);
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
            shadowLift: s.shadow_lift,
            highlightRecover: s.highlight_recover,
            vibrance: s.vibrance,
            jpegQuality: s.jpeg_quality,
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,340px)_1fr]">
      <section className="card p-6">
        <h2 className="font-semibold text-ocean-900">Pipeline knobs</h2>
        <p className="mt-1 text-sm text-slate-600">
          These apply to every job that runs through Oceano Enhance (HDR merge,
          single-shot, lawn, light declutter).
        </p>

        <div className="mt-4">
          <label className="label">Preset</label>
          <select
            className="input"
            onChange={(e) => e.target.value && applyPreset(e.target.value)}
            defaultValue=""
          >
            <option value="" disabled>
              Apply a preset…
            </option>
            {Object.keys(PRESETS).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Presets fill the sliders below — you can still tweak each value before saving.
          </p>
        </div>

        <div className="mt-6 space-y-5">
          <Slider
            label="Shadow lift"
            help="How aggressively to brighten dark areas. Higher = brighter shadows."
            value={s.shadow_lift}
            onChange={(v) => setS({ ...s, shadow_lift: v })}
          />
          <Slider
            label="Highlight recovery"
            help="Pulls bright windows + sky back from blowing out."
            value={s.highlight_recover}
            onChange={(v) => setS({ ...s, highlight_recover: v })}
          />
          <Slider
            label="Vibrance"
            help="Saturates muted colors without overdoing already-saturated ones."
            value={s.vibrance}
            onChange={(v) => setS({ ...s, vibrance: v })}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Long edge (px)</label>
              <input
                type="number"
                min={1200}
                max={6000}
                step={100}
                className="input"
                value={s.target_long_edge}
                onChange={(e) =>
                  setS({ ...s, target_long_edge: Math.max(1200, +e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-slate-500">3000 is MLS standard.</p>
            </div>
            <div>
              <label className="label">JPEG quality</label>
              <input
                type="number"
                min={60}
                max={100}
                className="input"
                value={s.jpeg_quality}
                onChange={(e) =>
                  setS({ ...s, jpeg_quality: Math.min(100, Math.max(60, +e.target.value)) })
                }
              />
              <p className="mt-1 text-xs text-slate-500">92 = pro default.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save settings'}
          </button>
          {savedAt && <span className="text-sm text-emerald-700">Saved {savedAt}</span>}
        </div>
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ocean-900">Live preview</h2>
          <button
            className="btn-secondary"
            onClick={runPreview}
            disabled={!photoId || previewing}
          >
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {previewing ? 'Rendering…' : 'Re-render'}
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Pick a recent upload and render it with the current slider values. Nothing is
          saved — this is a sandbox.
        </p>

        <div className="mt-4">
          <label className="label">Sample photo</label>
          <select
            className="input max-w-md"
            value={photoId ?? ''}
            onChange={(e) => setPhotoId(e.target.value || null)}
          >
            {recent.length === 0 && <option value="">No recent uploads</option>}
            {recent.map((p) => (
              <option key={p.id} value={p.id}>
                Order #{p.order_number} — {p.filename}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <PreviewPanel title="Before" url={originalUrl ?? undefined} />
          <PreviewPanel
            title="After (current sliders)"
            b64={previewB64 ?? undefined}
            placeholder={previewing ? 'Rendering…' : 'Click Re-render to preview.'}
          />
        </div>
      </section>
    </div>
  );
}

function Slider({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between">
        <label className="label">{label}</label>
        <span className="text-xs font-mono text-slate-500">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full"
      />
      <p className="text-xs text-slate-500">{help}</p>
    </div>
  );
}

function PreviewPanel({
  title,
  url,
  b64,
  placeholder,
}: {
  title: string;
  url?: string;
  b64?: string;
  placeholder?: string;
}) {
  const src = b64 ? `data:image/jpeg;base64,${b64}` : url;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
        {title}
      </div>
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
