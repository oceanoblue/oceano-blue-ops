import { NextResponse } from 'next/server';
import { z } from 'zod';
import { placeDetails, isPlacesConfigured } from '@/lib/google-maps/places';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const Body = z.object({
  place_id: z.string().min(1).max(400),
  session_token: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'places_details', 60, 60);
  if (limited) return limited;

  if (!isPlacesConfigured()) {
    return NextResponse.json({ error: 'maps_not_configured' }, { status: 503 });
  }
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const address = await placeDetails(parsed.data.place_id, parsed.data.session_token);
    return NextResponse.json({ address });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'details_failed' }, { status: 502 });
  }
}
