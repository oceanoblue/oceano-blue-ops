'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ScanLine, Sparkles, Sun, Zap } from 'lucide-react';
import { DEFAULT_FINISH_DEFAULTS, FINISH_STYLES, IMAGE_MODEL, IMAGE_MODELS, FinishDefaultsSchema, type Finish, type FinishDefaults, type ImageModel } from '@/lib/ai/finishing';

const references: Record<Finish['style'], { image: string; note: string }> = {
  bright_listing: { image: '/products/virtual_tour.webp', note: 'Light-filled · inviting' },
  natural: { image: '/products/interior_exterior_photo.webp', note: 'Balanced · authentic' },
  editorial: { image: '/products/cinematic_video.webp', note: 'Dimensional · composed' },
  flash_blend: { image: '/products/amenities.webp', note: 'Clean color · defined light' },
};
const selectClass = 'mt-2 w-full min-h-11 rounded-xl border border-white/15 bg-[#183438] px-3 py-2.5 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-[#a5e4d5] disabled:opacity-50';

export function FinishControls({ value, onChange, disabled = false, showModels = true }: { value: Finish; onChange: (finish: Finish) => void; disabled?: boolean; showModels?: boolean }) {
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
  const model = value.model ?? IMAGE_MODEL;
  return (
    <section className="overflow-hidden rounded-[24px] border border-[#25464b] bg-[#102a2e] text-white shadow-xl" aria-label="Photographic finish">
      <header className="relative overflow-hidden border-b border-white/10 px-5 py-7 sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-[#5aa99c]/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a5e4d5]"><Sparkles className="h-4 w-4" />Oceano · Photo Studio</div>
            <h3 className="font-serif text-3xl leading-tight tracking-tight text-white sm:text-4xl">Light, beautifully balanced.</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#b7ced0]">Choose the character of your edit. Preserve the character of the home.</p>
          </div>
          <label className="w-full text-xs font-medium text-[#c6d9db] sm:w-52">Scene
            <select aria-label="Scene type" disabled={disabled} className={selectClass} value={value.scene} onChange={e => { const scene = e.target.value as Finish['scene']; change({ ...defaults[scene], scene }); }}>
              <option value="auto">Auto / mixed selection</option><option value="interior">Interior</option><option value="exterior">Exterior</option>
            </select>
          </label>
        </div>
      </header>
      <div className="space-y-8 p-5 sm:p-8">
        {showModels && <div>
          <div className="mb-3 flex items-center gap-3"><span className="text-[11px] font-mono text-[#8eb5b8]">01</span><h4 className="text-sm font-semibold">Choose your model</h4></div>
          <div role="group" aria-label="Image model" className="grid gap-3 md:grid-cols-2">
            {Object.entries(IMAGE_MODELS).map(([id, item]) => <button key={id} type="button" disabled={disabled} aria-pressed={model === id} onClick={() => change({ ...value, model: id as ImageModel })}
              className={`group flex items-start gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a5e4d5] disabled:opacity-50 ${model === id ? 'border-[#a5e4d5] bg-[#1c4145]' : 'border-white/15 bg-white/[0.03] hover:border-white/40 hover:bg-white/[0.06]'}`}>
              <span className="mt-1 rounded-xl bg-white/10 p-2.5 text-[#a5e4d5]">{id === IMAGE_MODEL ? <Sun className="h-5 w-5" /> : <Zap className="h-5 w-5" />}</span>
              <span className="flex-1"><span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="text-base font-semibold">{item.label}</span><span className="text-[10px] uppercase tracking-wider text-[#b2d9d3]">{item.badge}</span></span><span className="mt-0.5 block text-xs text-[#9fbdc0]">{item.version}</span><span className="mt-2 block text-xs leading-relaxed text-[#c6d9db]">{item.description}</span></span>
              <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${model === id ? 'border-[#a5e4d5] bg-[#a5e4d5] text-[#102a2e]' : 'border-white/30'}`}>{model === id && <Check className="h-3.5 w-3.5" />}</span>
            </button>)}
          </div>
        </div>}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><span className="text-[11px] font-mono text-[#8eb5b8]">{showModels ? '02' : '01'}</span><h4 className="text-sm font-semibold">Find your finish</h4></div><span className="text-xs text-[#9fbdc0]">Style inspiration · results vary by photo</span></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Finish style">
            {Object.entries(FINISH_STYLES).map(([id, style]) => {
              const active = value.style === id;
              const ref = references[id as Finish['style']];
              return <button type="button" disabled={disabled} key={id} aria-pressed={active} onClick={() => change({ ...value, style: id as Finish['style'] })}
                className={`group overflow-hidden rounded-2xl border text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a5e4d5] disabled:opacity-50 ${active ? 'border-[#a5e4d5] bg-[#1c4145] ring-1 ring-[#a5e4d5]' : 'border-white/15 bg-[#183438] hover:border-white/40'}`}>
                <div className="relative aspect-[16/10] overflow-hidden">
                  {/* Existing brand photographs illustrate a mood, never a simulated render. */}
                  <img src={ref.image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 motion-safe:group-hover:scale-105" />
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />
                  <span className="absolute bottom-3 left-3 text-[10px] font-medium uppercase tracking-[0.12em] text-white">{ref.note}</span>
                  {active && <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#a5e4d5] text-[#102a2e] shadow"><Check className="h-4 w-4" /></span>}
                </div>
                <span className="block p-4"><span className="flex items-center justify-between text-base font-semibold text-white">{style.label}<ArrowUpRight className={`h-4 w-4 ${active ? 'text-[#a5e4d5]' : 'text-[#8eb5b8]'}`} /></span><span className="mt-2 block min-h-10 text-xs leading-relaxed text-[#c6d9db]">{style.description}</span></span>
              </button>;
            })}
          </div>
        </div>
        <div className="grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr]">
          <label className="text-xs font-medium text-[#c6d9db]">Window detail
            <select aria-label="Window detail" disabled={disabled} className={selectClass} value={value.windows} onChange={e => change({ ...value, windows: e.target.value as Finish['windows'] })}><option value="off">Off · keep as captured</option><option value="balanced">Balanced · natural daylight</option><option value="strong">Strong · clearer real views</option></select>
          </label>
          <label className="text-xs font-medium text-[#c6d9db]">Render quality
            <select aria-label="Render quality" disabled={disabled} className={selectClass} value={value.quality} onChange={e => change({ ...value, quality: e.target.value as Finish['quality'] })}><option value="high">High</option><option value="xhigh">Extra high · more time and cost</option></select>
          </label>
          <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3.5 sm:col-span-2 lg:col-span-1"><ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-[#a5e4d5]" /><p className="text-xs leading-relaxed text-[#c6d9db]"><span className="font-semibold text-white">Natural surface detail</span><br />Edits preserve real texture and avoid artificial ceiling and wall blotches. Inspect every result.</p></div>
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-black/10 px-5 py-4 sm:px-8">
        <p className="max-w-xl text-xs leading-relaxed text-[#b7ced0]">Window recovery uses a darker exposure of the same capture when available. Originals stay intact; new edits await your approval.</p>
        <button type="button" disabled={disabled || saving} onClick={saveDefault} className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a5e4d5] disabled:opacity-50">{saving ? 'Saving…' : 'Save as scene default'}</button>
        {status && <p role="status" className="w-full text-xs text-[#a5e4d5]">{status}</p>}
      </footer>
    </section>
  );
}
