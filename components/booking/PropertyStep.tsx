'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { AddressData, PropertyData } from '@/lib/booking/types';
import { fmtAddress } from '@/lib/utils/format';

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

  function updateAddress(field: 'address_line1' | 'address_line2' | 'city' | 'state' | 'zip', value: string) {
    setA(previous => {
      const next = { ...previous, [field]: value };
      return {
        ...next,
        formatted: fmtAddress(next),
        // Coordinates from address search no longer apply after a location edit.
        ...(field === 'address_line2' ? {} : { lat: null, lng: null }),
      };
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onComplete({ ...a, formatted: fmtAddress(a) }, p);
  }

  return (
    <form onSubmit={submit} className="card p-6 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-ocean-950 text-center">
        Confirm property details
      </h1>
      <p className="mt-2 text-center text-sm text-slate-600">
        Check the address, then add the size of the home.
      </p>

      <div className="mt-6 rounded-lg bg-slate-50 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Selected address</div>
            <div className="font-medium text-slate-800">{fmtAddress(a)}</div>
          </div>
        </div>
        <button type="button" className="btn-ghost text-sm" onClick={onEditAddress}>
          Change
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="confirm-address_line1">Street address</label>
          <input id="confirm-address_line1" autoComplete="address-line1" className="input text-base sm:text-sm" required maxLength={300} value={a.address_line1} onChange={(e) => updateAddress('address_line1', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="confirm-address_line2">Unit or apartment (optional)</label>
          <input id="confirm-address_line2" autoComplete="address-line2" className="input text-base sm:text-sm" maxLength={200} placeholder="Unit 2" value={a.address_line2} onChange={(e) => updateAddress('address_line2', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="confirm-city">City</label>
          <input id="confirm-city" autoComplete="address-level2" className="input text-base sm:text-sm" required maxLength={100} value={a.city} onChange={(e) => updateAddress('city', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="confirm-state">State</label>
          <input id="confirm-state" autoComplete="address-level1" className="input text-base sm:text-sm" required minLength={2} maxLength={2} value={a.state} onChange={(e) => updateAddress('state', e.target.value.toUpperCase())} />
        </div>
        <div>
          <label className="label" htmlFor="confirm-zip">ZIP code</label>
          <input id="confirm-zip" autoComplete="postal-code" inputMode="numeric" className="input text-base sm:text-sm" required pattern="[0-9]{5}(-[0-9]{4})?" maxLength={10} title="Enter a five-digit ZIP code" value={a.zip} onChange={(e) => updateAddress('zip', e.target.value)} />
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs uppercase tracking-wide text-slate-500">Property details</div>
        <div className="mt-2">
          <label className="label" htmlFor="property-sqft">Interior square footage <span className="text-rose-600" aria-hidden="true">*</span></label>
          <input
            id="property-sqft" type="number" inputMode="numeric"
            className="input text-base sm:text-sm"
            aria-describedby="property-sqft-help"
            required
            min={100} max={1000000} step={1}
            placeholder="2500"
            value={p.sqft || ''}
            onChange={(e) => setP({ ...p, sqft: Number(e.target.value) })}
          />
          <p id="property-sqft-help" className="mt-2 text-sm text-slate-600">
            Use the home&apos;s interior square footage. We&apos;ll use this to show prices for your property.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>← Back to address</button>
        <button type="submit" className="btn-primary" disabled={!p.sqft}>
          Choose services →
        </button>
      </div>
    </form>
  );
}
