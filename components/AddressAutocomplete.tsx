'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';

export interface PickedAddress {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  formatted: string;
}

interface Suggestion {
  placeId: string;
  text: string;
}

/**
 * Reusable address field with Google Places autocomplete via the SERVER proxy
 * (/api/places/*). No browser Maps key, no HTTP-referrer allow-list. Used by the
 * booking flow and the new-listing form. Free typing still flows through
 * onTextChange so the field works even if Places is unconfigured.
 */
export function AddressAutocomplete({
  value,
  onTextChange,
  onPick,
  placeholder = 'Search property address…',
  autoFocus,
}: {
  value: string;
  onTextChange: (v: string) => void;
  onPick: (a: PickedAddress) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionToken = useRef<string>(crypto.randomUUID());
  // Skip the autocomplete fetch on the keystroke right after a pick.
  const justPicked = useRef(false);

  useEffect(() => {
    const q = value.trim();
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
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
        const data = await r.json().catch(() => ({}));
        setSuggestions(r.ok ? data.suggestions ?? [] : []);
        setOpen(true);
      } catch {
        /* aborted / network — leave field usable for manual typing */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  async function pick(s: Suggestion) {
    justPicked.current = true;
    setOpen(false);
    setSuggestions([]);
    try {
      const r = await fetch('/api/places/details', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ place_id: s.placeId, session_token: sessionToken.current }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.address) onPick(data.address as PickedAddress);
      else onTextChange(s.text);
    } finally {
      sessionToken.current = crypto.randomUUID();
    }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        className="input pl-9"
        value={value}
        onChange={(e) => onTextChange(e.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lift">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
