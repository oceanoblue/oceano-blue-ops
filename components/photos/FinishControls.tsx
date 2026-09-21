'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { DEFAULT_FINISH_DEFAULTS, FINISH_STYLES, FinishDefaultsSchema, type Finish, type FinishDefaults } from '@/lib/ai/finishing';

export function FinishControls({ value, onChange, disabled = false }: { value: Finish; onChange: (finish: Finish) => void; disabled?: boolean }) {
  const [defaults, setDefaults] = useState<FinishDefaults>(DEFAULT_FINISH_DEFAULTS);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const touched = useRef(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  useEffect(() => {
    let cancelled = false;
    fetch('/api/enhance/defaults').then(async response => {
      if (!response.ok) throw new Error();
      const parsed = FinishDefaultsSchema.parse(await response.json());
      if (!cancelled) {
        setDefaults(parsed);
        if (!touched.current) changeRef.current(parsed.auto);
      }
    }).catch(() => { if (!cancelled) setStatus('Using built-in defaults. Saved preferences could not be loaded.'); });
    return () => { cancelled = true; };
  }, []);
  function change(next: Finish) { touched.current = true; setStatus(''); onChange(next); }
  async function saveDefault() {
    setSaving(true);
    const next = { ...defaults, [value.scene]: value };
    try {
      const response = await fetch('/api/enhance/defaults', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error();
      setDefaults(next);
      setStatus('Default saved for future edits. Existing versions stay unchanged.');
    } catch { setStatus('Could not save the default. Your choices still apply to this run.'); }
    finally { setSaving(false); }
  }
  return (
    <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-sm space-y-5" aria-label="Photographic finish">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-ocean-800"><Sparkles className="h-4 w-4" /><h3 className="font-semibold">Choose your finish</h3></div>
          <p className="text-sm text-slate-500 mt-1">Professional light and color, shaped around your property.</p>
        </div>
        <label className="text-xs font-medium text-slate-600">Scene
          <select aria-label="Scene type" disabled={disabled} className="input mt-1" value={value.scene} onChange={e => { const scene = e.target.value as Finish['scene']; change({ ...defaults[scene], scene }); }}>
            <option value="auto">Auto / mixed selection</option><option value="interior">Interior</option><option value="exterior">Exterior</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Finish style">
        {Object.entries(FINISH_STYLES).map(([id, style]) => (
          <button type="button" disabled={disabled} key={id} aria-pressed={value.style === id} onClick={() => change({ ...value, style: id as Finish['style'] })}
            className={`text-left rounded-xl border p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean-600 ${value.style === id ? 'border-ocean-600 bg-ocean-50 ring-1 ring-ocean-600' : 'border-slate-200 hover:border-ocean-400 hover:bg-slate-50'}`}>
            <span className="flex items-center justify-between gap-2 font-semibold text-sm text-ocean-950">{style.label}{value.style === id && <Check className="h-4 w-4 shrink-0" />}</span>
            <span className="block text-xs leading-relaxed text-slate-600 mt-2">{style.description}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4">
        <label className="text-xs font-medium text-slate-600">Window detail
          <select aria-label="Window detail" disabled={disabled} className="input mt-1" value={value.windows} onChange={e => change({ ...value, windows: e.target.value as Finish['windows'] })}>
            <option value="off">Off</option><option value="balanced">Balanced</option><option value="strong">Strong</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Render quality
          <select aria-label="Render quality" disabled={disabled} className="input mt-1" value={value.quality} onChange={e => change({ ...value, quality: e.target.value as Finish['quality'] })}>
            <option value="high">High</option><option value="xhigh">Extra high · more time and cost</option>
          </select>
        </label>
        <button type="button" disabled={disabled || saving} onClick={saveDefault} className="btn-secondary text-xs">{saving ? 'Saving…' : 'Save as scene default'}</button>
      </div>
      <p className="text-xs text-slate-500">Window detail uses a darker exposure from the same bracket when available. Missing views stay bright. Review the result before delivery.</p>
      {status && <p role="status" className="text-xs text-ocean-700">{status}</p>}
    </section>
  );
}
