import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyRespondToken } from '@/lib/field/respond-token';
import { recordContractorResponse, afterContractorResponse } from '@/lib/field/respond';

/**
 * Login-free accept / decline from the assignment email (or the calendar
 * invite's description). The signed token names the order + contractor; the
 * confirm page POSTs here. POST (not GET) on purpose, so link scanners that
 * prefetch email URLs can never accept a shoot on the photographer's behalf.
 */
const Body = z.object({
  response: z.enum(['accepted', 'declined']),
  note: z.string().max(2000).optional(),
});

export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const payload = verifyRespondToken(decodeURIComponent(params.token));
  if (!payload) return NextResponse.json({ error: 'invalid_or_expired_link' }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const parsed = Body.safeParse({
    response: form?.get('response'),
    note: (form?.get('note') as string | null) || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });

  // The link must still point at this contractor's live assignment.
  const admin = createAdminClient() as any;
  const { data: contractor } = await admin
    .from('contractors')
    .select('id, is_active')
    .eq('id', payload.c)
    .maybeSingle();
  if (!contractor?.is_active) return NextResponse.json({ error: 'invalid_or_expired_link' }, { status: 400 });

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const result = await recordContractorResponse({
    orderId: payload.o,
    contractorId: payload.c,
    response: parsed.data.response,
    note: parsed.data.note ?? null,
  });
  const done = new URL(`/field/respond/${encodeURIComponent(params.token)}`, base);
  if (!result.ok) {
    done.searchParams.set('state', 'stale');
    return NextResponse.redirect(done, 303);
  }

  await afterContractorResponse({
    orderId: payload.o,
    response: parsed.data.response,
    note: parsed.data.note ?? null,
    source: 'email',
    baseUrl: base,
  });

  done.searchParams.set('state', parsed.data.response);
  return NextResponse.redirect(done, 303);
}
