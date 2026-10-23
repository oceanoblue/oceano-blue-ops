'use client';
import { stagingRooms, stagingStyles, stagingPalettes, stagingFurnishing, stagingAccents, type StagingChoices } from '@/lib/gallery-edits/staging';

export function StagingReference({ style }: { style: StagingChoices['style'] }) {
  const selected = stagingStyles[style];
  return <figure className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
    {/* Static, optimized public samples also work in the downloadable offline preview. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={selected.image} alt={`${selected.label} living room style example`} width={960} height={640} loading="lazy" className="h-auto w-full" />
    <figcaption className="p-4"><p className="text-sm font-semibold text-ocean-950">{selected.label} · Style reference</p><p className="mt-1 text-xs leading-5 text-slate-600">{selected.description}</p><p className="mt-2 text-xs leading-5 text-slate-500">AI-generated living room example, not your property. This image illustrates the style only; room, palette and furnishing choices are applied when your edit is created. Exact furniture and layout will vary.</p></figcaption>
  </figure>;
}

export function StagingOptions({ value, onChange }: { value: StagingChoices; onChange: (value: StagingChoices) => void }) {
  function change<K extends keyof StagingChoices>(key: K, selected: StagingChoices[K]) {
    onChange({ ...value, [key]: selected });
  }
  return <div className="mt-5 space-y-5">
    <div><label htmlFor="staging-room" className="text-sm font-medium">Room type</label><select id="staging-room" className="input mt-2 w-full" value={value.room} onChange={e => change('room', e.target.value as StagingChoices['room'])}>{Object.entries(stagingRooms).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
    <fieldset><legend className="text-sm font-medium">Choose a style</legend><p className="mt-1 text-xs leading-5 text-slate-500">Select a reference to explore the look. Browsing is free.</p><div className="mt-3 grid grid-cols-2 gap-3">{Object.entries(stagingStyles).map(([id, item]) => <label key={id} className={`relative cursor-pointer overflow-hidden rounded-xl border-2 focus-within:ring-2 focus-within:ring-ocean-500 ${value.style === id ? 'border-ocean-500 bg-ocean-50' : 'border-slate-200 bg-white'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.image} alt="" width={960} height={640} loading="lazy" className="aspect-[3/2] w-full object-cover" />
      <span className="flex items-start gap-2 p-3"><input aria-label={item.label} type="radio" name="staging-style" value={id} checked={value.style === id} onChange={() => change('style', id as StagingChoices['style'])} className="mt-1 accent-blue-600"/><span className="text-xs font-semibold leading-5">{item.label}</span></span>
    </label>)}</div></fieldset>
    <fieldset><legend className="text-sm font-medium">Make it yours</legend><p className="mt-1 text-xs leading-5 text-slate-500">These choices apply to added furniture and textiles. Walls, floors and finishes stay as photographed.</p>
      <fieldset className="mt-3"><legend className="text-xs font-medium text-slate-600">Color palette</legend><div className="mt-2 grid grid-cols-2 gap-2">{Object.entries(stagingPalettes).map(([id, item]) => <label key={id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${value.palette === id ? 'border-ocean-500 bg-ocean-50' : 'border-slate-200'}`}><input type="radio" name="staging-palette" value={id} checked={value.palette === id} onChange={() => change('palette', id as StagingChoices['palette'])} className="mt-1 accent-blue-600"/><span><span className="block text-xs font-medium leading-5">{item.label}</span><span className="mt-1 flex gap-1" aria-hidden="true">{item.colors.map(color => <span key={color} className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: color }}/>)}</span></span></label>)}</div></fieldset>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label htmlFor="staging-furnishing" className="text-xs font-medium text-slate-600">Furniture amount</label><select id="staging-furnishing" className="input mt-1 w-full text-sm" value={value.furnishing} onChange={e => change('furnishing', e.target.value as StagingChoices['furnishing'])}>{Object.entries(stagingFurnishing).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div><div><label htmlFor="staging-accents" className="text-xs font-medium text-slate-600">Finishing touches</label><select id="staging-accents" className="input mt-1 w-full text-sm" value={value.accents} onChange={e => change('accents', e.target.value as StagingChoices['accents'])}>{Object.entries(stagingAccents).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div></div>
    </fieldset>
    <div className="rounded-xl bg-ocean-50 p-4 text-xs leading-5 text-ocean-950" aria-live="polite"><p className="font-semibold">Your staging request · 2 credits</p><p className="mt-1">{stagingRooms[value.room]} · {stagingStyles[value.style].label}<br/>{stagingPalettes[value.palette].label} · {stagingFurnishing[value.furnishing]} · {stagingAccents[value.accents]}</p></div>
  </div>;
}
