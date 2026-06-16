import { NextResponse } from 'next/server';
import { z } from 'zod';
import { placesAutocomplete, isPlacesConfigured } from '@/lib/google-maps/places';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

// Public (used by the unauthenticated booking flow) → rate limit per IP.
const Body = z.object({
  input: z.string().min(1).max(200),
  session_token: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'places_autocomplete', 60, 60);
  if (limited) return limited;

  if (!isPlacesConfigured()) {
    return NextResponse.json({ error: 'maps_not_configured' }, { status: 503 });
  }
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const suggestions = await placesAutocomplete(parsed.data.input, parsed.data.session_token);
    return NextResponse.json({ suggestions });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'autocomplete_failed' }, { status: 502 });
  }
}
