'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Home } from 'lucide-react';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';

interface ClientOpt {
  id: string;
  full_name: string;
  brokerage: string | null;
}

/**
 * Internal listing-first entry point: address + client, optional property
 * details. On create, lands on the listing detail where a photo order can be
 * started with one click.
 */
export function NewListingForm({ clients }: { clients: ClientOpt[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Existing client vs. create-one-inline. Default to "new" when there are no
  // clients yet, so an empty system isn't a dead end.
  const [clientMode, setClientMode] = useState<'existing' | 'new'>(clients.length ? 'existing' : 'new');
  const [nc, setNc] = useState({ full_name: '', email: '', phone: '', brokerage: '' });
  const [f, setF] = useState({
    client_id: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: 'SC',
    zip: '',
    mls_id: '',
    property_type: '',
    bedrooms: '',
    bathrooms: '',
    sqft: '',
    list_price: '',
    access_notes: '',
  });

  function set<K extends keyof typeof f>(key: K, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(clientMode === 'existing'
            ? { client_id: f.client_id }
            : {
                new_client: {
                  full_name: nc.full_name.trim(),
                  email: nc.email.trim(),
                  phone: nc.phone.trim(),
                  brokerage: nc.brokerage.trim(),
                },
              }),
          address_line1: f.address_line1.trim(),
          address_line2: f.address_line2.trim(),
          city: f.city.trim(),
          state: f.state.trim(),
          zip: f.zip.trim(),
          mls_id: f.mls_id.trim(),
          property_type: f.property_type.trim(),
          bedrooms: f.bedrooms ? Number(f.bedrooms) : null,
          bathrooms: f.bathrooms ? Number(f.bathrooms) : null,
          sqft: f.sqft ? Number(f.sqft) : null,
          list_price: f.list_price ? Math.round(Number(f.list_price)) : null,
          access_notes: f.access_notes.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `error_${res.status}`);
      router.push(`/dashboard/listings/${json.listing_id}`);
    } catch (err: any) {
      setError(err?.message ?? 'failed');
      setBusy(false);
    }
  }

  const clientOk =
    clientMode === 'existing' ? !!f.client_id : !!nc.full_name.trim() && !!nc.email.trim();
  const canSubmit =
    clientOk && f.address_line1.trim() && f.city.trim() && f.state.trim() && f.zip.trim();

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-5 p-6">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <label className="label mb-0">Client *</label>
          {clients.length > 0 && (
            <button
              type="button"
              onClick={() => setClientMode((m) => (m === 'existing' ? 'new' : 'existing'))}
              className="text-xs font-medium text-ocean-700 hover:underline"
            >
              {clientMode === 'existing' ? '+ New client' : '← Pick existing'}
            </button>
          )}
        </div>

        {clientMode === 'existing' ? (
          <select className="input mt-1.5" value={f.client_id} onChange={(e) => set('client_id', e.target.value)}>
            <option value="">— pick the agent / client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.brokerage ? ` · ${c.brokerage}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-1.5 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Full name *</label>
              <input className="input" value={nc.full_name} onChange={(e) => setNc((p) => ({ ...p, full_name: e.target.value }))} placeholder="Agent name" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input className="input" type="email" value={nc.email} onChange={(e) => setNc((p) => ({ ...p, email: e.target.value }))} placeholder="agent@brokerage.com" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={nc.phone} onChange={(e) => setNc((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Brokerage</label>
              <input className="input" value={nc.brokerage} onChange={(e) => setNc((p) => ({ ...p, brokerage: e.target.value }))} />
            </div>
            <p className="sm:col-span-2 text-xs text-slate-500">
              Saved as a new client and attached to this listing. If the email already exists, that client is reused.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Address *</label>
          <AddressAutocomplete
            value={f.address_line1}
            onTextChange={(v) => set('address_line1', v)}
            onPick={(a) =>
              setF((prev) => ({
                ...prev,
                address_line1: a.address_line1 || prev.address_line1,
                city: a.city || prev.city,
                state: a.state || prev.state,
                zip: a.zip || prev.zip,
              }))
            }
            placeholder="47 South Sea Pines Drive"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address line 2</label>
          <input className="input" value={f.address_line2} onChange={(e) => set('address_line2', e.target.value)} placeholder="Unit / suite (optional)" />
        </div>
        <div>
          <label className="label">City *</label>
          <input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">State *</label>
            <input className="input" value={f.state} onChange={(e) => set('state', e.target.value)} required />
          </div>
          <div>
            <label className="label">ZIP *</label>
            <input className="input" value={f.zip} onChange={(e) => set('zip', e.target.value)} required />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">MLS #</label>
          <input className="input" value={f.mls_id} onChange={(e) => set('mls_id', e.target.value)} />
        </div>
        <div>
          <label className="label">Property type</label>
          <select className="input" value={f.property_type} onChange={(e) => set('property_type', e.target.value)}>
            <option value="">—</option>
            <option value="single_family">Single family</option>
            <option value="condo">Condo</option>
            <option value="townhouse">Townhouse</option>
            <option value="multi_family">Multi-family</option>
            <option value="land">Land</option>
            <option value="commercial">Commercial</option>
          </select>
        </div>
        <div>
          <label className="label">Sq ft</label>
          <input className="input" type="number" min={0} value={f.sqft} onChange={(e) => set('sqft', e.target.value)} />
        </div>
        <div>
          <label className="label">Bedrooms</label>
          <input className="input" type="number" min={0} value={f.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} />
        </div>
        <div>
          <label className="label">Bathrooms</label>
          <input className="input" type="number" min={0} step={0.5} value={f.bathrooms} onChange={(e) => set('bathrooms', e.target.value)} />
        </div>
        <div>
          <label className="label">List price ($)</label>
          <input className="input" type="number" min={0} value={f.list_price} onChange={(e) => set('list_price', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Access notes</label>
        <textarea className="input min-h-[70px]" value={f.access_notes} onChange={(e) => set('access_notes', e.target.value)} placeholder="Gate code, lockbox, contact on site…" />
      </div>

      <button type="submit" className="btn-primary" disabled={busy || !canSubmit}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Home className="h-4 w-4" />}
        Create listing
      </button>
    </form>
  );
}
