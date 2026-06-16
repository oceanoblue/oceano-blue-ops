'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import type { AddressData } from '@/lib/booking/types';

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

      {!manual ? (
        <div className="mt-8">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lift">
                {suggestions.map((s) => (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      onClick={() => pick(s)}
                      className="flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span>{s.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setManual(true)}
            className="mt-3 text-sm text-slate-500 underline hover:text-slate-700"
          >
            Can&apos;t find it? Enter address manually
          </button>
        </div>
      ) : (
        <ManualAddressForm
          value={manualAddr}
          onChange={setManualAddr}
          onSubmit={() => onComplete(manualAddr)}
          onBackToSearch={() => setManual(false)}
        />
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
      className="mt-8 space-y-3"
    >
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
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBackToSearch} className="text-sm text-slate-500 underline hover:text-slate-700">
          ← Back to search
        </button>
        <button className="btn-primary" type="submit"><MapPin className="h-4 w-4" /> Use this address</button>
      </div>
    </form>
  );
}
