'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Loader2, ExternalLink, FileText, Home, HardHat } from 'lucide-react';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import {
  BUILDER_PACKAGES, BUILDER_ADDONS, BUILDER_PROGRAM_DISCOUNT, builderTierFor, type BuilderPackage,
} from '@/lib/quotes/builder-pricing';

export interface QuoteProduct {
  slug: string;
  name: string;
  is_addon: boolean;
  base_price_cents: number;
}

type ClientType = 'realtor' | 'builder';

const money = (c: number) => `$${(c / 100).toLocaleString('en-US')}`;

export function QuoteBuilder({ products }: { products: QuoteProduct[] }) {
  const [clientType, setClientType] = useState<ClientType>('realtor');
  const [client, setClient] = useState({ name: '', email: '' });
  const [addr, setAddr] = useState({ address_line1: '', city: '', state: '', zip: '', sqft: '' });
  const [notes, setNotes] = useState('');
  const [expiresDays, setExpiresDays] = useState(14);

  // Realtor à-la-carte selection.
  const [slugs, setSlugs] = useState<Set<string>>(new Set(['interior_exterior_photo']));
  // Builder selection.
  const [pkg, setPkg] = useState<BuilderPackage>('feature');
  const [addonQty, setAddonQty] = useState<Record<string, number>>({}); // slug -> qty (presence = selected)
  const [program, setProgram] = useState(false);

  const [preview, setPreview] = useState<{ items: any[]; subtotal_cents: number }>({ items: [], subtotal_cents: 0 });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const core = products.filter((p) => !p.is_addon);
  const addons = products.filter((p) => p.is_addon);
  const sqftNum = addr.sqft.trim() === '' ? null : Number(addr.sqft);

  const toggleSlug = (slug: string) =>
    setSlugs((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });

  const toggleAddon = (slug: string) =>
    setAddonQty((prev) => {
      const next = { ...prev };
      if (slug in next) delete next[slug];
      else next[slug] = 1;
      return next;
    });
  const setQty = (slug: string, qty: number) =>
    setAddonQty((prev) => ({ ...prev, [slug]: Math.max(1, qty) }));

  const builderAddonsPayload = useMemo(
    () => Object.entries(addonQty).map(([slug, qty]) => ({ slug, qty })),
    [addonQty]
  );

  // Live pricing preview.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const body =
        clientType === 'builder'
          ? { client_type: 'builder', sqft: sqftNum, pkg, addons: builderAddonsPayload, program }
          : { client_type: 'realtor', sqft: sqftNum, slugs: [...slugs] };
      if (clientType === 'realtor' && slugs.size === 0) { setPreview({ items: [], subtotal_cents: 0 }); return; }
      try {
        const r = await fetch('/api/quotes', {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body), signal: ctrl.signal,
        });
        const d = await r.json();
        if (!ctrl.signal.aborted) setPreview({ items: d.items ?? [], subtotal_cents: d.subtotal_cents ?? 0 });
      } catch { /* ignore */ }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [clientType, slugs, pkg, builderAddonsPayload, program, sqftNum]);

  const canCreate =
    !!addr.address_line1 && !busy && (clientType === 'realtor' ? slugs.size > 0 : !!pkg);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const payload =
        clientType === 'builder'
          ? { client_type: 'builder', pkg, addons: builderAddonsPayload, program }
          : { client_type: 'realtor', slugs: [...slugs] };
      const r = await fetch('/api/quotes', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          client_name: client.name.trim(),
          client_email: client.email.trim(),
          address_line1: addr.address_line1.trim(),
          city: addr.city.trim(),
          state: addr.state.trim(),
          zip: addr.zip.trim(),
          sqft: sqftNum,
          notes: notes.trim(),
          expires_days: expiresDays,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || d.error || `Failed (${r.status})`);
      setResult({ url: d.url });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (result) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="font-display text-xl font-semibold text-ocean-950">Quote ready to share</h2>
        <p className="mt-1 text-sm text-slate-600">Send this link to {client.name || 'your client'}.</p>
        <div className="mx-auto mt-5 flex max-w-xl items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 pl-4">
          <span className="flex-1 truncate font-mono text-sm text-ink-800">{result.url}</span>
          <button onClick={copy} className="btn-primary shrink-0 text-sm">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <div className="mt-5 flex items-center justify-center gap-3">
          <a href={result.url} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
            Open quote <ExternalLink className="h-4 w-4" />
          </a>
          <button onClick={() => { setResult(null); }} className="btn-ghost text-sm">New quote</button>
        </div>
      </div>
    );
  }

  const tier = builderTierFor(sqftNum);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,20rem]">
      <div className="card space-y-6 p-6">
        {/* Client type — realtor listing vs builder / architect */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <TypeTab active={clientType === 'realtor'} onClick={() => setClientType('realtor')} icon={Home} title="Realtor" sub="Single listing" />
          <TypeTab active={clientType === 'builder'} onClick={() => setClientType('builder')} icon={HardHat} title="Builder / Architect" sub="Per completed home" />
        </div>

        <Section title="Client">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" value={client.name} onChange={(v) => setClient({ ...client, name: v })} placeholder={clientType === 'builder' ? 'Palmetto Bluff Builders' : 'Jane Agent'} />
            <Field label="Email" type="email" value={client.email} onChange={(v) => setClient({ ...client, email: v })} placeholder="jane@brokerage.com" />
          </div>
        </Section>

        <Section title="Property">
          <div className="space-y-3">
            <div>
              <label className="label">Street address <span className="text-rose-600">*</span></label>
              <AddressAutocomplete
                value={addr.address_line1}
                onTextChange={(v) => setAddr({ ...addr, address_line1: v })}
                onPick={(a) => setAddr((p) => ({ ...p, address_line1: a.address_line1 || p.address_line1, city: a.city || p.city, state: a.state || p.state, zip: a.zip || p.zip }))}
                placeholder="Start typing an address…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2"><Field label="City" value={addr.city} onChange={(v) => setAddr({ ...addr, city: v })} /></div>
              <Field label="State" value={addr.state} onChange={(v) => setAddr({ ...addr, state: v })} />
              <Field label={clientType === 'builder' ? 'Heated sq ft' : 'Sq ft'} type="number" value={addr.sqft} onChange={(v) => setAddr({ ...addr, sqft: v })} placeholder="3200" />
            </div>
          </div>
        </Section>

        {clientType === 'realtor' ? (
          <Section title="Services">
            <div className="space-y-2">
              {core.map((p) => <RealtorRow key={p.slug} p={p} on={slugs.has(p.slug)} toggle={() => toggleSlug(p.slug)} />)}
            </div>
            {addons.length > 0 && (
              <>
                <div className="label mt-4 mb-2">Add-ons</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {addons.map((p) => <RealtorRow key={p.slug} p={p} on={slugs.has(p.slug)} toggle={() => toggleSlug(p.slug)} />)}
                </div>
              </>
            )}
          </Section>
        ) : (
          <>
            <Section title="Package">
              <div className="grid gap-2 sm:grid-cols-2">
                {BUILDER_PACKAGES.map((p) => {
                  const price = Math.max(0, tier[p.slug] - (program ? BUILDER_PROGRAM_DISCOUNT[p.slug] : 0));
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => setPkg(p.slug)}
                      className={`rounded-xl border p-3 text-left transition-colors ${pkg === p.slug ? 'border-ocean-400 bg-ocean-50/60 ring-1 ring-ocean-200' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-ink-900">{p.name}</span>
                        <span className="font-mono text-sm text-ocean-700">{money(price)}</span>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-snug text-slate-500">{p.desc}</p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 font-mono text-[11px] text-slate-400">
                {tier.images} images · priced per completed home · 7,500+ sq ft quoted individually
              </p>
            </Section>

            <Section title="Add-ons">
              <div className="grid gap-2 sm:grid-cols-2">
                {BUILDER_ADDONS.map((a) => {
                  const includedByPkg = a.slug === 'drone_video' && (pkg === 'feature' || pkg === 'signature');
                  const hidden = a.videoOnly && pkg === 'photo';
                  if (hidden) return null;
                  const on = includedByPkg || a.slug in addonQty;
                  return (
                    <BuilderAddonRow
                      key={a.slug}
                      name={a.name}
                      price={a.price_cents}
                      unit={a.unit}
                      qtyEnabled={!!a.qty}
                      qty={addonQty[a.slug] ?? 1}
                      on={on}
                      locked={includedByPkg}
                      onToggle={() => !includedByPkg && toggleAddon(a.slug)}
                      onQty={(q) => setQty(a.slug, q)}
                    />
                  );
                })}
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <input type="checkbox" checked={program} onChange={() => setProgram((v) => !v)} className="h-4 w-4 rounded border-slate-300 text-ocean-600" />
                <span className="text-sm text-ink-900">Builder program rate <span className="text-slate-500">— 4+ homes in 12 months</span></span>
              </label>
            </Section>
          </>
        )}

        <Section title="Details">
          <div className="space-y-3">
            <div>
              <label className="label">Note to client (optional)</label>
              <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Send an address and punch-out date to hold a window…" />
            </div>
            <div className="w-40">
              <label className="label">Hold price for</label>
              <select className="input" value={expiresDays} onChange={(e) => setExpiresDays(Number(e.target.value))}>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>
          </div>
        </Section>
      </div>

      {/* Live summary */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="card p-6">
          <div className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
            <FileText className="h-3.5 w-3.5" /> Quote preview
          </div>
          {preview.items.length === 0 ? (
            <p className="text-sm text-slate-500">{clientType === 'builder' ? 'Pick a package to price the quote.' : 'Pick services to price the quote.'}</p>
          ) : (
            <ul className="space-y-2">
              {preview.items.map((i, idx) => (
                <li key={idx} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-800">{i.name}</span>
                  {i.complimentary ? (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-ocean-700">Included</span>
                  ) : (
                    <span className="font-mono tabular-nums text-ink-800">{money(i.price_cents)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
            <span className="text-sm font-semibold text-ink-900">Total</span>
            <span className="font-mono text-xl font-semibold tabular-nums text-ocean-700">{money(preview.subtotal_cents)}</span>
          </div>
          {err && <p className="mt-3 rounded-md bg-rose-50 p-2 text-xs text-rose-700">{err}</p>}
          <button onClick={create} disabled={!canCreate} className="btn-primary mt-4 w-full justify-center">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? 'Creating…' : 'Create shareable quote'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TypeTab({ active, onClick, icon: Icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${active ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-ink-800'}`}
    >
      <Icon className={`h-5 w-5 ${active ? 'text-ocean-700' : 'text-slate-400'}`} />
      <span>
        <span className={`block text-sm font-medium ${active ? 'text-ink-900' : ''}`}>{title}</span>
        <span className="block text-[11px] text-slate-400">{sub}</span>
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ocean-900">{title}</div>
      {children}
    </section>
  );
}

function RealtorRow({ p, on, toggle }: { p: QuoteProduct; on: boolean; toggle: () => void }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors ${on ? 'border-ocean-300 bg-ocean-50/50' : 'border-slate-200'}`}>
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={on} onChange={toggle} className="h-4 w-4 rounded border-slate-300 text-ocean-600" />
        <span className="text-sm text-ink-900">{p.name}</span>
      </span>
      <span className="font-mono text-xs text-slate-500">{p.base_price_cents ? `from ${money(p.base_price_cents)}` : '—'}</span>
    </label>
  );
}

function BuilderAddonRow({ name, price, unit, qtyEnabled, qty, on, locked, onToggle, onQty }: {
  name: string; price: number; unit?: string; qtyEnabled: boolean; qty: number; on: boolean; locked: boolean;
  onToggle: () => void; onQty: (q: number) => void;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${on ? 'border-ocean-300 bg-ocean-50/50' : 'border-slate-200'}`}>
      <label className="flex flex-1 cursor-pointer items-center gap-2">
        <input type="checkbox" checked={on} disabled={locked} onChange={onToggle} className="h-4 w-4 rounded border-slate-300 text-ocean-600 disabled:opacity-60" />
        <span className="text-sm text-ink-900">{name}</span>
      </label>
      <span className="flex items-center gap-2">
        {on && qtyEnabled && !locked && (
          <input
            type="number" min={1} value={qty}
            onChange={(e) => onQty(Number(e.target.value))}
            className="w-12 rounded border border-slate-200 px-1.5 py-0.5 text-center text-xs tabular-nums"
            aria-label={`${name} quantity`}
          />
        )}
        <span className="font-mono text-xs text-slate-500">{locked ? 'Incl.' : `${money(price)}${unit ? `/${unit}` : ''}`}</span>
      </span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...(type === 'number' ? { min: 0 } : {})} />
    </div>
  );
}
