'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import type { AddressData } from '@/lib/booking/types';

declare global {
  interface Window {
    google: any;
    initGooglePlaces?: () => void;
  }
}

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/**
 * Loads the Google Maps Places library once and resolves when the
 * `google.maps.places` namespace is ready.
 */
function loadGooglePlaces(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (!GMAPS_KEY) return Promise.reject(new Error('Maps key missing'));
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('gmaps-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Maps load failed')));
      return;
    }
    const s = document.createElement('script');
    s.id = 'gmaps-script';
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Maps load failed'));
    document.head.appendChild(s);
  });
}

export function AddressStep({
  initial,
  onComplete,
}: {
  initial: AddressData | null;
  onComplete: (a: AddressData) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyMissing, setKeyMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState<AddressData>(
    initial ?? { address_line1: '', address_line2: '', city: '', state: '', zip: '', lat: null, lng: null, formatted: '' }
  );

  useEffect(() => {
    if (!GMAPS_KEY) {
      setLoading(false);
      setKeyMissing(true);
      return;
    }
    let cancelled = false;
    loadGooglePlaces()
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: ['us'] },
          fields: ['address_components', 'geometry', 'formatted_address'],
        });
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          const components = place.address_components || [];
          const get = (type: string) =>
            components.find((c: any) => c.types.includes(type))?.short_name || '';
          const longGet = (type: string) =>
            components.find((c: any) => c.types.includes(type))?.long_name || '';
          const streetNo = get('street_number');
          const route = longGet('route');
          const a: AddressData = {
            address_line1: `${streetNo} ${route}`.trim(),
            address_line2: '',
            city:
              longGet('locality') ||
              longGet('sublocality') ||
              longGet('administrative_area_level_3') ||
              '',
            state: get('administrative_area_level_1'),
            zip: get('postal_code'),
            lat: place.geometry?.location?.lat() ?? null,
            lng: place.geometry?.location?.lng() ?? null,
            formatted: place.formatted_address || '',
          };
          onComplete(a);
        });
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onComplete]);

  return (
    <div className="card p-6 sm:p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-semibold text-ocean-950 text-center">
        Where's your property?
      </h1>

      {!keyMissing ? (
        <div className="mt-8 relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder={loading ? 'Loading…' : 'Search property address…'}
            disabled={loading}
            defaultValue={initial?.formatted ?? ''}
            className="input pl-11 py-3 text-base"
            autoFocus
          />
          {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
        </div>
      ) : (
        <ManualAddressForm value={manual} onChange={setManual} onSubmit={() => onComplete(manual)} />
      )}

      <p className="mt-4 text-center text-xs text-slate-500">
        We service the East Coast — primarily SC, NJ, NY, PA, CT, and FL.
      </p>
    </div>
  );
}

function ManualAddressForm({
  value,
  onChange,
  onSubmit,
}: {
  value: AddressData;
  onChange: (v: AddressData) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-8 space-y-3"
    >
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
        Address autocomplete is unavailable. Enter your address manually.
      </p>
      <input
        className="input"
        placeholder="Street address"
        required
        value={value.address_line1}
        onChange={(e) => onChange({ ...value, address_line1: e.target.value })}
      />
      <div className="grid grid-cols-3 gap-2">
        <input className="input" placeholder="City" required value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} />
        <input className="input" placeholder="State" required maxLength={2} value={value.state} onChange={(e) => onChange({ ...value, state: e.target.value.toUpperCase() })} />
        <input className="input" placeholder="ZIP" required value={value.zip} onChange={(e) => onChange({ ...value, zip: e.target.value })} />
      </div>
      <button className="btn-primary w-full" type="submit"><MapPin className="h-4 w-4" /> Use this address</button>
    </form>
  );
}
