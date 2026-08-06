'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Camera } from 'lucide-react';
import { AddressAutocomplete, type PickedAddress } from '@/components/AddressAutocomplete';

const SERVICE_OPTIONS = [
  { value: 'photos', label: 'Photos' },
  { value: '360', label: '360 photos' },
  { value: 'drone', label: 'Drone' },
  { value: 'video', label: 'Video' },
  { value: 'twilight', label: 'Twilight' },
  { value: 'floor_plan', label: 'Floor plan' },
  { value: 'matterport', label: '3D tour' },
];

/** Mobile-first "log a shoot" form for contractors. Address autocomplete +
 *  size + services. Creates the shoot, then jumps to its page to upload RAWs. */
export function NewShootForm() {
  const router = useRouter();
  const [addr, setAddr] = useState('');
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [sqft, setSqft] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [services, setServices] = useState<string[]>(['photos']);
  const [accessNotes, setAccessNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleService(v: string) {
    setServices((prev) => (prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!addr.trim()) {
      setError('Enter the property address.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        address_line1: picked?.address_line1 || addr.trim(),
        address_line2: picked?.address_line2 || undefined,
        city: picked?.city || '',
        state: picked?.state || '',
        zip: picked?.zip || '',
        lat: picked?.lat ?? undefined,
        lng: picked?.lng ?? undefined,
        property_type: propertyType || undefined,
        bedrooms: beds ? Number(beds) : undefined,
        bathrooms: baths ? Number(baths) : undefined,
        sqft: sqft ? Number(sqft.replace(/[^0-9]/g, '')) : undefined,
        access_notes: accessNotes || undefined,
        services,
      };
      const r = await fetch('/api/field/shoots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      router.push(`/field/shoots/${d.order_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="label">Property address</label>
        <AddressAutocomplete
          value={addr}
          onTextChange={(v) => {
            setAddr(v);
            setPicked(null);
          }}
          onPick={(a) => {
            setPicked(a);
            setAddr(a.formatted || a.address_line1);
          }}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Square footage</label>
          <input
            inputMode="numeric"
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            placeholder="e.g. 2400"
            className="input"
          />
        </div>
        <div>
          <label className="label">Property type</label>
          <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="input">
            <option value="">—</option>
            <option value="single_family">Single-family</option>
            <option value="condo">Condo</option>
            <option value="townhouse">Townhouse</option>
            <option value="multi_family">Multi-family</option>
            <option value="land">Land</option>
            <option value="commercial">Commercial</option>
          </select>
        </div>
        <div>
          <label className="label">Bedrooms</label>
          <input
            inputMode="numeric"
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            placeholder="—"
            className="input"
          />
        </div>
        <div>
          <label className="label">Bathrooms</label>
          <input
            inputMode="decimal"
            value={baths}
            onChange={(e) => setBaths(e.target.value)}
            placeholder="—"
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label">Services shot</label>
        <div className="flex flex-wrap gap-2">
          {SERVICE_OPTIONS.map((s) => {
            const on = services.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleService(s.value)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition ${
                  on
                    ? 'bg-ocean-600 text-white ring-ocean-600'
                    : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="label">Access / notes (optional)</label>
        <textarea
          value={accessNotes}
          onChange={(e) => setAccessNotes(e.target.value)}
          rows={2}
          placeholder="Lockbox code, gate, contact…"
          className="input"
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3 text-base disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        Create shoot &amp; get upload folder
      </button>
    </form>
  );
}
