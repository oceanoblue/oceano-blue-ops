'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { AddressData, PropertyData } from '@/lib/booking/types';

export function PropertyStep({
  address,
  property,
  onBack,
  onComplete,
  onEditAddress,
}: {
  address: AddressData;
  property: PropertyData;
  onBack: () => void;
  onEditAddress: () => void;
  onComplete: (a: AddressData, p: PropertyData) => void;
}) {
  const [a, setA] = useState(address);
  const [p, setP] = useState(property);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onComplete(a, p);
  }

  return (
    <form onSubmit={submit} className="card p-6 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-ocean-950 text-center">
        Confirm property details
      </h1>
      <p className="mt-2 text-center text-sm text-slate-600">
        Verify the address and add property details
      </p>

      <div className="mt-6 rounded-lg bg-slate-50 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Selected address</div>
            <div className="font-medium text-slate-800">{a.formatted || `${a.address_line1}, ${a.city} ${a.state}`}</div>
          </div>
        </div>
        <button type="button" className="btn-ghost text-sm" onClick={onEditAddress}>
          Change
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Address line 1</label>
          <input className="input" required value={a.address_line1} onChange={(e) => setA({ ...a, address_line1: e.target.value })} />
        </div>
        <div>
          <label className="label">Address line 2</label>
          <input className="input" placeholder="Suite 100" value={a.address_line2} onChange={(e) => setA({ ...a, address_line2: e.target.value })} />
        </div>
        <div>
          <label className="label">City</label>
          <input className="input" required value={a.city} onChange={(e) => setA({ ...a, city: e.target.value })} />
        </div>
        <div>
          <label className="label">State</label>
          <input className="input" required maxLength={2} value={a.state} onChange={(e) => setA({ ...a, state: e.target.value.toUpperCase() })} />
        </div>
        <div>
          <label className="label">Postal code</label>
          <input className="input" required value={a.zip} onChange={(e) => setA({ ...a, zip: e.target.value })} />
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs uppercase tracking-wide text-slate-500">Property details</div>
        <div className="mt-2">
          <label className="label">Square footage <span className="text-rose-600">*</span></label>
          <input
            type="number"
            className="input"
            required
            min={100}
            placeholder="2500"
            value={p.sqft || ''}
            onChange={(e) => setP({ ...p, sqft: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="mt-8 flex gap-2 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>← Back</button>
        <button type="submit" className="btn-primary" disabled={!p.sqft}>
          Continue →
        </button>
      </div>
    </form>
  );
}
