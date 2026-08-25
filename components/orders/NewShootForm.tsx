'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, User, Home, Calendar, Camera, ChevronDown, Loader2, Package } from 'lucide-react';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';

export interface ClientOpt { id: string; full_name: string; brokerage: string | null }
export interface ContractorOpt { id: string; full_name: string; pay_rate_cents: number }
export interface TeamOpt { id: string; full_name: string }
export interface ProductOpt { id: string; name: string; kind: string; is_addon: boolean; base_price_cents: number }

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
  products,
}: {
  clients: ClientOpt[];
  contractors: ContractorOpt[];
  team: TeamOpt[];
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

  // Schedule.
  const [scheduledAt, setScheduledAt] = useState(''); // datetime-local
  const [duration, setDuration] = useState(60);

  const [pkg, setPkg] = useState('Essential');
  const [instructions, setInstructions] = useState('');

  // Products on this shoot → priced order_items. qty 0 / absent = not selected.
  const [items, setItems] = useState<Record<string, number>>({});
  const setQty = (id: string, qty: number) =>
    setItems((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  const coreProducts = products.filter((p) => !p.is_addon);
  const addonProducts = products.filter((p) => p.is_addon);
  const estTotal = products.reduce((s, p) => s + (items[p.id] ?? 0) * p.base_price_cents, 0);
  const fmtUsd = (c: number) => `$${(c / 100).toLocaleString('en-US')}`;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const assigneeIsContractor = assignee.startsWith('contractor:');

  const clientValid = clientMode === 'existing' ? !!clientId : !!(nc.full_name && nc.email);
  const propertyValid = !!(addr.address_line1 && addr.city && addr.state && addr.zip);
  const canSubmit = clientValid && propertyValid && !busy;

  const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      duration_minutes: duration,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
      package_name: pkg,
      instructions: instructions.trim(),
      create_intake_link: true,
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
    <form onSubmit={submit} className="card p-6 space-y-6">
      {/* Client */}
      <Section icon={<User className="h-4 w-4" />} title="Client">
        <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
          <Toggle active={clientMode === 'existing'} onClick={() => setClientMode('existing')} disabled={!clients.length}>
            Existing
          </Toggle>
          <Toggle active={clientMode === 'new'} onClick={() => setClientMode('new')}>
            New client
          </Toggle>
        </div>

        {clientMode === 'existing' ? (
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Choose a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}{c.brokerage ? ` · ${c.brokerage}` : ''}
              </option>
            ))}
          </select>
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
      <Section icon={<Home className="h-4 w-4" />} title="Property">
        <div className="space-y-3">
          <div>
            <label className="label">Street address <span className="text-rose-600">*</span></label>
            <AddressAutocomplete
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
              <Field label="Sq ft" type="number" value={addr.sqft} onChange={(v) => setAddr({ ...addr, sqft: v })} />
              <div className="col-span-2 sm:col-span-3">
                <Field label="Access notes (lockbox, gate code…)" value={addr.access_notes} onChange={(v) => setAddr({ ...addr, access_notes: v })} placeholder="Lockbox on front door, code 1234" />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Photographer */}
      <Section icon={<Camera className="h-4 w-4" />} title="Photographer">
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
        </select>
        {assigneeIsContractor && (
          <p className="mt-2 text-xs text-emerald-700">
            A Dropbox upload link is created automatically — you can send it to the photographer with one tap on the next screen.
          </p>
        )}
      </Section>

      {/* Schedule */}
      <Section icon={<Calendar className="h-4 w-4" />} title="Schedule (optional)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Date &amp; time</label>
            <input
              type="datetime-local"
              className="input"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Duration</label>
            <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
        </div>
      </Section>

      {/* Products — priced line items → order total (what the paywall charges) */}
      {products.length > 0 && (
        <Section icon={<Package className="h-4 w-4" />} title="Products">
          <div className="space-y-4">
            {coreProducts.length > 0 && (
              <div className="space-y-2">
                {coreProducts.map((p) => (
                  <ProductRow
                    key={p.id}
                    name={p.name}
                    price={`from ${fmtUsd(p.base_price_cents)}`}
                    qty={items[p.id] ?? 0}
                    onQty={(q) => setQty(p.id, q)}
                  />
                ))}
              </div>
            )}
            {addonProducts.length > 0 && (
              <div>
                <div className="label mb-2">Add-ons</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {addonProducts.map((p) => (
                    <ProductRow
                      key={p.id}
                      name={p.name}
                      price={p.base_price_cents ? `from ${fmtUsd(p.base_price_cents)}` : '—'}
                      qty={items[p.id] ?? 0}
                      onQty={(q) => setQty(p.id, q)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500" title="Final price is calculated from the property's square footage at delivery.">
                Estimated total (final price by sq ft)
              </span>
              <span className="font-semibold text-ocean-900 tabular-nums">{fmtUsd(estTotal)}</span>
            </div>
          </div>
        </Section>
      )}

      {/* Package + instructions */}
      <Section icon={<ClipboardList className="h-4 w-4" />} title="Package &amp; instructions">
        <div className="space-y-3">
          <div>
            <label className="label">Package</label>
            <select className="input" value={pkg} onChange={(e) => setPkg(e.target.value)}>
              <option>Essential</option>
              <option>Premium</option>
              <option>Premium + Drone</option>
              <option>Twilight + Drone</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label className="label">Shoot instructions (sent to the photographer)</label>
            <textarea
              className="input"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Interior + exterior, twilight front elevation, emphasize the water view…"
            />
          </div>
        </div>
      </Section>

      {err && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">{err}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" className="btn-ghost" onClick={() => router.push('/dashboard/orders')}>
          Cancel
        </button>
        <button className="btn-primary inline-flex items-center gap-2" disabled={!canSubmit}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Creating shoot…' : 'Create shoot'}
        </button>
      </div>
    </form>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 text-sm font-medium text-ocean-900 mb-3">
        <span className="text-slate-500">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
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
      className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
        on ? 'border-ocean-300 bg-ocean-50/50' : 'border-slate-200'
      }`}
    >
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onQty(e.target.checked ? 1 : 0)}
          className="h-4 w-4 rounded border-slate-300 text-ocean-600"
        />
        <span className="text-sm text-ocean-900">{name}</span>
      </label>
      <div className="flex items-center gap-3">
        {on && (
          <div className="inline-flex items-center rounded-md border border-slate-200 text-slate-600">
            <button type="button" onClick={() => onQty(qty - 1)} className="px-2 py-0.5 hover:bg-slate-50" aria-label="Decrease">−</button>
            <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
            <button type="button" onClick={() => onQty(qty + 1)} className="px-2 py-0.5 hover:bg-slate-50" aria-label="Increase">+</button>
          </div>
        )}
        <span className="text-sm tabular-nums text-slate-500">{price}</span>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', required = false,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="label">{label} {required && <span className="text-rose-600">*</span>}</label>
      <input
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
