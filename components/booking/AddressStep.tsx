'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import type { AddressData } from '@/lib/booking/types';
import { fmtAddress } from '@/lib/utils/format';

interface Suggestion {
  placeId: string;
  text: string;
}

const EMPTY: AddressData = {
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip: '',
  lat: null,
  lng: null,
  formatted: '',
};

/**
 * Address entry backed by a SERVER-side Places proxy (/api/places/*). The key
 * lives only on the server, so there's no browser HTTP-referrer allow-list to
 * maintain per Vercel domain (the old client-side loader kept getting rejected).
 * Falls back to manual entry if Places is unconfigured or errors.
 */
export function AddressStep({
  initial,
  onComplete,
}: {
  initial: AddressData | null;
  onComplete: (a: AddressData) => void;
}) {
  const [query, setQuery] = useState(initial?.formatted ?? '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualAddr, setManualAddr] = useState<AddressData>(initial ?? EMPTY);
  // Session token groups autocomplete keystrokes + the final details call into
  // one billable session. Reset after each completed selection.
  const sessionToken = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    const q = query.trim();
    if (manual || q.length < 3) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/places/autocomplete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: q, session_token: sessionToken.current }),
          signal: ctrl.signal,
        });
        if (r.status === 503) {
          // Places not configured server-side → drop to manual entry.
          setManual(true);
          return;
        }
        const data = await r.json().catch(() => ({}));
        setSuggestions(r.ok ? data.suggestions ?? [] : []);
        setOpen(true);
      } catch {
        /* aborted or network — ignore; user can keep typing or go manual */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, manual]);

  async function pick(s: Suggestion) {
    setOpen(false);
    setQuery(s.text);
    setResolving(true);
    try {
      const r = await fetch('/api/places/details', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ place_id: s.placeId, session_token: sessionToken.current }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.address) {
        onComplete(data.address as AddressData);
      } else {
        // Couldn't resolve — let them confirm/fix manually, prefilled with the text.
        setManual(true);
        setManualAddr((m) => ({ ...m, address_line1: s.text }));
      }
    } catch {
      setManual(true);
      setManualAddr(m => ({ ...m, address_line1: s.text }));
    } finally {
      sessionToken.current = crypto.randomUUID(); // new billing session
      setResolving(false);
    }
  }

  return (
    <div className="card p-6 sm:p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-semibold text-ocean-950 text-center">
        Where&apos;s your property?
      </h1>
      <p className="mt-2 text-center text-sm text-slate-600">
        Start with the property address. You can review everything before you submit.
      </p>
      <ol aria-label="How booking works" className="mt-5 grid gap-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-3">
        {['Add property details', 'Choose services and a time', 'Review and submit'].map((step, index) => (
          <li key={step} className="flex items-start gap-2">
            <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-ocean-800">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {!manual ? (
        <div className="mt-6">
          <label htmlFor="property-search" className="label">Property address</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              id="property-search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open && suggestions.length > 0}
              aria-controls="property-suggestions"
              aria-describedby="property-search-help"
              aria-activedescendant={open && activeSuggestion >= 0 && activeSuggestion < suggestions.length ? `property-option-${activeSuggestion}` : undefined}
              onKeyDown={e => {
                if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActiveSuggestion(i => Math.max(i - 1, 0)); }
                if (e.key === "Escape") { setOpen(false); setActiveSuggestion(-1); }
                if (e.key === "Enter" && open && suggestions[activeSuggestion]) { e.preventDefault(); void pick(suggestions[activeSuggestion]); }
              }}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveSuggestion(-1); }}
              onFocus={() => suggestions.length && setOpen(true)}
              placeholder="Search property address…"
              className="input pl-11 py-3 text-base"
              autoFocus
              autoComplete="off"
            />
            {(loading || resolving) && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
            )}
            {open && suggestions.length > 0 && (
              <ul id="property-suggestions" role="listbox" aria-label="Address suggestions" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lift">
                {suggestions.map((s, index) => (
                  <li key={s.placeId} id={`property-option-${index}`} role="option" aria-selected={activeSuggestion === index}>
                    <button
                      type="button"
                      onClick={() => pick(s)}
                      className={`flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${activeSuggestion === index ? 'bg-ocean-50' : ''}`}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span>{s.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p id="property-search-help" role="status" className="mt-2 text-sm text-slate-500">
            {resolving ? 'Checking the selected address…'
              : loading ? 'Finding matching addresses…'
                : open && query.trim().length >= 3 && suggestions.length === 0 ? 'No matching addresses found. You can enter it manually below.'
                  : 'Start typing, then choose your address from the list.'}
          </p>
          <button
            type="button"
            onClick={() => setManual(true)}
            className="mt-2 inline-flex min-h-11 items-center text-sm text-slate-600 underline hover:text-slate-800"
          >
            Can&apos;t find it? Enter address manually
          </button>
        </div>
      ) : (
        <ManualAddressForm
          value={manualAddr}
          onChange={setManualAddr}
          onSubmit={() => onComplete({ ...manualAddr, formatted: fmtAddress(manualAddr), lat: null, lng: null })}
          onBackToSearch={() => setManual(false)}
        />
      )}

      <p className="mt-4 text-center text-xs text-slate-500">
        Serving Hilton Head, Bluffton, Beaufort, Savannah, and the surrounding Lowcountry and Coastal Empire.
      </p>
    </div>
  );
}

function ManualAddressForm({
  value,
  onChange,
  onSubmit,
  onBackToSearch,
}: {
  value: AddressData;
  onChange: (v: AddressData) => void;
  onSubmit: () => void;
  onBackToSearch: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-6 space-y-3"
    >
      <label className="label" htmlFor="street-address">Street address</label>
      <input
        id="street-address" autoComplete="address-line1"
        className="input text-base sm:text-sm"
        placeholder="Street address"
        required maxLength={300}
        value={value.address_line1}
        onChange={(e) => onChange({ ...value, address_line1: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="label col-span-2 sm:col-span-1">City<input autoComplete="address-level2" className="input text-base sm:text-sm" placeholder="City" required maxLength={100} value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} /></label>
        <label className="label">State<input autoComplete="address-level1" className="input text-base sm:text-sm" placeholder="State" required minLength={2} maxLength={2} value={value.state} onChange={(e) => onChange({ ...value, state: e.target.value.toUpperCase() })} /></label>
        <label className="label">ZIP code<input autoComplete="postal-code" inputMode="numeric" className="input text-base sm:text-sm" placeholder="ZIP code" pattern="[0-9]{5}(-[0-9]{4})?" title="Enter a five-digit ZIP code" required maxLength={10} value={value.zip} onChange={(e) => onChange({ ...value, zip: e.target.value })} /></label>
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onBackToSearch} className="inline-flex min-h-11 items-center justify-center text-sm text-slate-600 underline hover:text-slate-800">
          ← Back to search
        </button>
        <button className="btn-primary" type="submit"><MapPin className="h-4 w-4" /> Use this address</button>
      </div>
    </form>
  );
}
