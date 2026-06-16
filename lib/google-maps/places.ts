/**
 * Server-side Google Places (New) client. Used by the public booking address
 * step via /api/places/* so the Maps key never ships to the browser and there's
 * no fragile HTTP-referrer allow-list to maintain per Vercel domain.
 *
 * Requires a key with the Places API (New) enabled + billing on. Prefer a
 * dedicated server key (GOOGLE_MAPS_SERVER_KEY) with NO HTTP-referrer
 * restriction (referrer-restricted keys are rejected on server requests).
 * Falls back to the existing public key if that's all that's configured.
 */
const KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export function isPlacesConfigured(): boolean {
  return Boolean(KEY);
}

export interface PlaceSuggestion {
  placeId: string;
  text: string;
}

/** Address autocomplete suggestions for a query, biased to US addresses. */
export async function placesAutocomplete(
  input: string,
  sessionToken?: string
): Promise<PlaceSuggestion[]> {
  if (!KEY) throw new Error('maps_key_missing');
  const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': KEY },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['us'],
      ...(sessionToken ? { sessionToken } : {}),
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`places_autocomplete_${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  return ((data.suggestions ?? []) as any[])
    .map((s) => ({
      placeId: s.placePrediction?.placeId as string,
      text: (s.placePrediction?.text?.text ?? '') as string,
    }))
    .filter((s) => s.placeId && s.text);
}

export interface PlaceAddress {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  formatted: string;
}

/** Full address + geometry for a selected place id. */
export async function placeDetails(
  placeId: string,
  sessionToken?: string
): Promise<PlaceAddress> {
  if (!KEY) throw new Error('maps_key_missing');
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
  const r = await fetch(url.toString(), {
    headers: {
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'addressComponents,location,formattedAddress',
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`place_details_${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  const comps = (data.addressComponents ?? []) as any[];
  const get = (type: string, long = true) => {
    const c = comps.find((x) => (x.types ?? []).includes(type));
    return (long ? c?.longText : c?.shortText) ?? '';
  };
  const streetNo = get('street_number', false);
  const route = get('route');
  return {
    address_line1: `${streetNo} ${route}`.trim(),
    address_line2: '',
    city:
      get('locality') ||
      get('sublocality') ||
      get('administrative_area_level_3') ||
      '',
    state: get('administrative_area_level_1', false),
    zip: get('postal_code', false),
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    formatted: data.formattedAddress ?? '',
  };
}
