'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, User, Home, Calendar, Camera, ChevronDown, Loader2, Package, Check, ArrowRight } from 'lucide-react';
import { servicePrice, type ServiceProduct } from '@/lib/orders/service-pricing';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';

export interface ClientOpt { id: string; full_name: string; brokerage: string | null }
export interface ContractorOpt { id: string; full_name: string; pay_rate_cents: number }
export interface TeamOpt { id: string; full_name: string }
export interface ProductOpt extends ServiceProduct { kind: string; is_addon: boolean }

/**
 * One-screen "New Shoot" — client + property + assignment + (auto) Dropbox link
 * in a single submit, for shoots arranged manually (not booked on the website).
 * Posts to /api/shoots, then lands on the order page where the upload link is
 * already provisioned and one tap sends it to the photographer.
 */
export function NewShootForm({
  clients,
  contractors,
  team,
  videographers,
  products,
}: {
  clients: ClientOpt[];
  contractors: ContractorOpt[];
  team: TeamOpt[];
  videographers: TeamOpt[];
  products: ProductOpt[];
}) {
  const router = useRouter();

  // Client: pick existing or add new inline.
  const [clientMode, setClientMode] = useState<'existing' | 'new'>(
    clients.length ? 'existing' : 'new'
  );
  const [clientId, setClientId] = useState('');
  const [nc, setNc] = useState({ full_name: '', email: '', phone: '', brokerage: '' });

  // Property.
  const [addr, setAddr] = useState({
    address_line1: '', address_line2: '', city: '', state: '', zip: '',
    mls_id: '', property_type: '', bedrooms: '', bathrooms: '', sqft: '', list_price: '',
    access_notes: '',
  });
  const [showDetails, setShowDetails] = useState(false);

  // Assignment — unified value encodes type: "contractor:<id>" | "team:<id>" | ''.
  const [assignee, setAssignee] = useState('');
  const [videographer, setVideographer] = useState('');

  // Schedule.
  const [scheduledAt, setScheduledAt] = useState(''); // datetime-local
  const [duration, setDuration] = useState(60);

  const [clientSearch, setClientSearch] = useState('');
  const [instructions, setInstructions] = useState('');

  // Products on this shoot → priced order_items. qty 0 / absent = not selected.
  const [items, setItems] = useState<Record<string, number>>({});
  const setQty = (id: string, qty: number) =>
    setItems((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(qty, 20);
      return next;
    });
  const coreProducts = products.filter((p) => !p.is_addon);
  const addonProducts = products.filter((p) => p.is_addon);
  const estTotal = products.reduce((s, p) => s + (items[p.id] ?? 0) * servicePrice(p, addr.sqft ? Number(addr.sqft) : null), 0);
  const fmtUsd = (c: number) => `$${(c / 100).toLocaleString('en-US')}`;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState(false);

  const assigneeIsContractor = assignee.startsWith('contractor:');

  const clientValid = clientMode === 'existing' ? !!clientId : !!(nc.full_name && nc.email);
  const propertyValid = !!(addr.address_line1 && addr.city && addr.state && addr.zip);
  const canSubmit = clientValid && propertyValid && !busy;
  const selectedProducts = products.filter(p => (items[p.id] ?? 0) > 0);
  const visibleClients = clients.filter(c => c.id === clientId || `${c.full_name} ${c.brokerage ?? ''}`.toLowerCase().includes(clientSearch.toLowerCase()));

  const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    doSubmit(false);
  }

  async function doSubmit(allowOverlap: boolean) {
    setBusy(true);
    setErr(null);

    const [type, id] = assignee ? assignee.split(':') : [null, null];

    const payload: Record<string, unknown> = {
      address_line1: addr.address_line1.trim(),
      address_line2: addr.address_line2.trim(),
      city: addr.city.trim(),
      state: addr.state.trim(),
      zip: addr.zip.trim(),
      mls_id: addr.mls_id.trim(),
      property_type: addr.property_type.trim(),
      bedrooms: numOrNull(addr.bedrooms),
      bathrooms: numOrNull(addr.bathrooms),
      sqft: numOrNull(addr.sqft),
      list_price: numOrNull(addr.list_price),
      access_notes: addr.access_notes.trim(),
      assignee: type && id ? { type, id } : null,
      videographer_id: videographer || null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      duration_minutes: duration,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
      instructions: instructions.trim(),
      create_intake_link: true,
      allow_overlap: allowOverlap,
      items: Object.entries(items)
        .filter(([, q]) => q > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity })),
    };
    if (clientMode === 'existing') payload.client_id = clientId;
    else payload.new_client = { ...nc, email: nc.email.trim(), full_name: nc.full_name.trim() };

    try {
      const r = await fetch('/api/shoots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Travel-buffer conflict → offer the staff override instead of a hard stop.
        if (r.status === 409 && d.error === 'slot_unavailable' && !allowOverlap) {
          setNeedsOverride(true);
          setBusy(false);
          return;
        }
        throw new Error(
          d.message || (d.error === 'validation_failed' ? 'Please fill in the required fields.' : d.error) || `Failed (${r.status})`
        );
      }
      // Land on the order workspace — link is already provisioned there.
      router.push(`/dashboard/orders/${d.order_id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="order-create grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="min-w-0 space-y-5">
      {/* Client */}
      <Section icon={<User className="h-4 w-4" />} title="Client" step="01" description="Who is this shoot for?">
        <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
          <Toggle active={clientMode === 'existing'} onClick={() => setClientMode('existing')} disabled={!clients.length}>
            Existing
          </Toggle>
          <Toggle active={clientMode === 'new'} onClick={() => setClientMode('new')}>
            New client
          </Toggle>
        </div>

        {clientMode === 'existing' ? (
          <div className="space-y-3"><label className="block text-sm font-medium text-slate-700">Find a client<input className="input mt-2" placeholder="Search name or brokerage" value={clientSearch} onChange={e => setClientSearch(e.target.value)} /></label>
          <label className="block text-sm font-medium text-slate-700">Client<select className="input mt-2" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Choose a client</option>
            {visibleClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}{c.brokerage ? ` · ${c.brokerage}` : ''}
              </option>
            ))}
          </select></label>{!visibleClients.length && <p className="text-sm text-slate-500">No matching clients. Choose New client to add one.</p>}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name" required value={nc.full_name} onChange={(v) => setNc({ ...nc, full_name: v })} placeholder="Jane Agent" />
            <Field label="Email" required type="email" value={nc.email} onChange={(v) => setNc({ ...nc, email: v })} placeholder="jane@brokerage.com" />
            <Field label="Phone" value={nc.phone} onChange={(v) => setNc({ ...nc, phone: v })} placeholder="(843) 555-0100" />
            <Field label="Brokerage" value={nc.brokerage} onChange={(v) => setNc({ ...nc, brokerage: v })} placeholder="Coastal Realty" />
          </div>
        )}
      </Section>

      {/* Property */}
      <Section icon={<Home className="h-4 w-4" />} title="Property" step="02" description="The address and size determine the shoot details and pricing.">
        <div className="space-y-3">
          <div>
            <label htmlFor="shoot-address" className="label">Street address <span className="text-rose-600">*</span></label>
            <AddressAutocomplete
              id="shoot-address"
              value={addr.address_line1}
              onTextChange={(v) => setAddr({ ...addr, address_line1: v })}
              onPick={(a) =>
                setAddr((prev) => ({
                  ...prev,
                  address_line1: a.address_line1 || prev.address_line1,
                  address_line2: a.address_line2 || prev.address_line2,
                  city: a.city || prev.city,
                  state: a.state || prev.state,
                  zip: a.zip || prev.zip,
                }))
              }
              placeholder="Start typing an address…"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-2">
              <Field label="City" required value={addr.city} onChange={(v) => setAddr({ ...addr, city: v })} placeholder="Charleston" />
            </div>
            <Field label="State" required value={addr.state} onChange={(v) => setAddr({ ...addr, state: v })} placeholder="SC" />
            <Field label="ZIP" required value={addr.zip} onChange={(v) => setAddr({ ...addr, zip: v })} placeholder="29401" />
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <label className="block text-sm font-medium text-slate-700">Property size (sq ft)<input className="input mt-2" type="number" min="1" max="1000000" step="1" value={addr.sqft} onChange={e => setAddr({ ...addr, sqft: e.target.value })} placeholder="e.g. 1,250" /></label>
            <p className="mt-2 text-xs text-slate-500">Used to price photography. Leave blank if unknown and adjust the order later.</p>
          </div>

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            {showDetails ? 'Hide' : 'Add'} property details (optional)
          </button>

          {showDetails && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <Field label="Unit / Suite" value={addr.address_line2} onChange={(v) => setAddr({ ...addr, address_line2: v })} placeholder="Unit 4B" />
              <Field label="MLS #" value={addr.mls_id} onChange={(v) => setAddr({ ...addr, mls_id: v })} />
              <Field label="Property type" value={addr.property_type} onChange={(v) => setAddr({ ...addr, property_type: v })} placeholder="Single family" />
              <Field label="Beds" type="number" value={addr.bedrooms} onChange={(v) => setAddr({ ...addr, bedrooms: v })} />
              <Field label="Baths" type="number" value={addr.bathrooms} onChange={(v) => setAddr({ ...addr, bathrooms: v })} />
              <div className="col-span-2 sm:col-span-3">
                <Field label="Access notes (lockbox, gate code…)" value={addr.access_notes} onChange={(v) => setAddr({ ...addr, access_notes: v })} placeholder="Lockbox on front door, code 1234" />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Products — priced line items → order total (what the paywall charges) */}
      {products.length > 0 && (
        <Section icon={<Package className="h-4 w-4" />} title="Services" step="03" description="Choose exactly what the client needs. Prices update with property size.">
          <div className="space-y-4">

            {!addr.sqft && <p className="text-sm text-amber-800">No size entered: starting prices will be used. You can edit prices and services after booking.</p>}
            {coreProducts.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {coreProducts.map((p) => (
                  <ProductRow
                    key={p.id}
                    name={p.name}
                    price={fmtUsd(servicePrice(p, addr.sqft ? Number(addr.sqft) : null))}
                    qty={items[p.id] ?? 0}
                    onQty={(q) => setQty(p.id, q)}
                  />
                ))}
              </div>
            )}
            {addonProducts.length > 0 && (
              <details className="rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">Optional extras <span className="font-normal text-slate-500">({addonProducts.length})</span></summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {addonProducts.map((p) => (
                    <ProductRow
                      key={p.id}
                      name={p.name}
                      price={fmtUsd(servicePrice(p, addr.sqft ? Number(addr.sqft) : null))}
                      qty={items[p.id] ?? 0}
                      onQty={(q) => setQty(p.id, q)}
                    />
                  ))}
                </div>
              </details>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500" title="Prices are calculated when the shoot is created. You can edit services on the order afterward.">
                Total at booking
              </span>
              <span className="font-semibold text-ocean-900 tabular-nums">{fmtUsd(estTotal)}</span>
            </div>
          </div>
        </Section>
      )}

      {/* Photographer */}
      <Section icon={<Camera className="h-4 w-4" />} title="Schedule & crew" step="04" description="Set the appointment now, or finish these details after booking.">
        <label className="block text-sm font-medium text-slate-700">Photographer
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">— Assign later —</option>
          {contractors.length > 0 && (
            <optgroup label="Contractors">
              {contractors.map((c) => (
                <option key={c.id} value={`contractor:${c.id}`}>
                  {c.full_name}{c.pay_rate_cents ? ` · $${(c.pay_rate_cents / 100).toFixed(0)}/property` : ''}
                </option>
              ))}
            </optgroup>
          )}
          {team.length > 0 && (
            <optgroup label="Team">
              {team.map((t) => (
                <option key={t.id} value={`team:${t.id}`}>{t.full_name}</option>
              ))}
            </optgroup>
          )}
        </select></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">Videographer
          <select className="input" value={videographer} onChange={e=>setVideographer(e.target.value)}><option value="">— Assign later —</option>{videographers.map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select>
        </label>
        <p className="mt-2 text-xs text-slate-500">Choose the same person for both roles or assign a separate video professional. Both reserve the appointment time.</p>
        {assigneeIsContractor && (
          <p className="mt-2 text-xs text-emerald-700">
            A Dropbox upload link is created automatically — you can send it to the photographer with one tap on the next screen.
          </p>
        )}
      <div className="mt-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="shoot-date" className="label">Date &amp; time</label>
            <input
              id="shoot-date"
              type="datetime-local"
              className="input"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="shoot-duration" className="label">Duration</label>
            <select id="shoot-duration" className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
        </div>
      </div>
      </Section>

      <details className="card p-5 sm:p-6"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Shoot instructions <span className="ml-2 font-normal text-slate-500">Optional</span></summary><label className="mt-4 block text-sm text-slate-600">What should the photographer know?<textarea className="input mt-2" rows={3} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Special requests, rooms to prioritize, or details to capture…" /></label></details>
    </div>
    <aside className="space-y-4 xl:sticky xl:top-24">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-100 bg-ink-950 p-6 text-white"><p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">Shoot summary</p><h2 className="mt-3 text-2xl leading-tight">{addr.address_line1 || 'Your next shoot'}</h2><p className="mt-2 text-sm text-slate-300">{clientMode==='new' ? nc.full_name || 'New client' : clients.find(c=>c.id===clientId)?.full_name || 'Choose a client to get started'}</p></div>
        <div className="space-y-5 p-6">
          {selectedProducts.length ? <ul className="space-y-3">{selectedProducts.map(p=><li key={p.id} className="flex items-start justify-between gap-3 text-sm"><span className="text-slate-600">{p.name}{items[p.id]>1?` × ${items[p.id]}`:''}</span><span className="shrink-0 font-medium">{fmtUsd(servicePrice(p,addr.sqft?Number(addr.sqft):null)*items[p.id])}</span></li>)}</ul> : <p className="text-sm leading-relaxed text-slate-500">Select services to build this shoot. You can add or change them after booking.</p>}
          <div className="flex items-center justify-between border-t pt-4"><span className="text-sm font-medium">Order total</span><strong className="text-2xl tracking-tight">{fmtUsd(estTotal)}</strong></div>
          {!addr.sqft && selectedProducts.length>0 && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">Starting prices are shown because property size is missing.</p>}
          <ul className="space-y-2 text-xs text-slate-500"><li className="flex gap-2"><Check className="h-4 w-4 text-ocean-700"/>Services and prices stay editable.</li><li className="flex gap-2"><Check className="h-4 w-4 text-ocean-700"/>You control when the client is notified.</li></ul>
        </div>
      </div>
      {err && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">{err}</p>
      )}

      {needsOverride && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">
            ⚠️ This photographer already has a shoot inside the travel buffer of this time. Book it anyway?
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setNeedsOverride(false);
                doSubmit(true);
              }}
              disabled={busy}
              className="btn-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Book anyway
            </button>
            <button type="button" onClick={() => setNeedsOverride(false)} className="btn-ghost text-sm">
              Pick another slot
            </button>
          </div>
        </div>
      )}

      <button className="btn-primary min-h-12 w-full" disabled={!canSubmit}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowRight className="h-4 w-4"/>}{busy?'Creating shoot…':'Create shoot'}</button>
      {!canSubmit && !busy && <p className="text-center text-xs text-slate-500">Choose a client and complete the address to continue.</p>}
      <button type="button" className="btn-ghost min-h-11 w-full" onClick={()=>router.push('/dashboard/orders')}>Cancel</button>
    </aside>
    </form>
  );
}

function Section({ icon, title, step, description, children }: { icon: React.ReactNode; title: string; step?: string; description?: string; children: React.ReactNode }) {
  return <section className="card p-5 sm:p-6"><div className="mb-5 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-medium text-slate-600">{step || icon}</span><div><h2 className="text-xl font-semibold text-ink-950">{title}</h2>{description&&<p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>}</div></div>{children}</section>;
}

function Toggle({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1 font-medium transition-colors disabled:opacity-40 ${
        active ? 'bg-white text-ocean-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function ProductRow({
  name, price, qty, onQty,
}: {
  name: string; price: string; qty: number; onQty: (q: number) => void;
}) {
  const on = qty > 0;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors ${
        on ? 'border-ocean-300 bg-ocean-50/60 ring-1 ring-ocean-200' : 'border-slate-200'
      }`}
    >
      <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onQty(e.target.checked ? 1 : 0)}
          className="h-4 w-4 shrink-0 rounded border-slate-300 accent-ocean-700"
        />
        <span className="text-sm text-ocean-900">{name}</span>
      </label>
      <div className="flex items-center gap-3">
        {on && (
          <div className="inline-flex items-center rounded-md border border-slate-200 text-slate-600">
            <button type="button" onClick={() => onQty(qty - 1)} className="min-h-9 px-3 hover:bg-slate-50" aria-label={`Decrease ${name}`}>−</button>
            <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
            <button type="button" onClick={() => onQty(qty + 1)} className="min-h-9 px-3 hover:bg-slate-50" aria-label={`Increase ${name}`}>+</button>
          </div>
        )}
        <span className="text-sm font-semibold tabular-nums text-ink-900">{price}</span>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', required = false,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  const id=useId();
  return (
    <div>
      <label htmlFor={id} className="label">{label} {required && <span className="text-rose-600">*</span>}</label>
      <input
        id={id}
        type={type}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        {...(type === 'number' ? { min: 0 } : {})}
      />
    </div>
  );
}
