import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { afterContractorResponse } from '@/lib/field/respond';

/**
 * Contractor accepts or declines their assigned shoot from the portal. The
 * state change goes through respond_to_assignment() (SECURITY DEFINER —
 * re-derives the caller's contractor and enforces "your own assignment"), so
 * this route is safe under the public /api/field prefix. Afterwards the office
 * is notified and the answer is mirrored onto the Google Calendar invite.
 */
const Body = z.object({
  response: z.enum(['accepted', 'declined']),
  note: z.string().max(2000).optional(),
});

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });

  // Ownership + the write are enforced inside the RPC.
  const { data, error } = await supabase.rpc('respond_to_assignment', {
    p_order_id: params.id,
    p_response: parsed.data.response,
    p_note: parsed.data.note?.trim() || undefined,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const res = data as { ok?: boolean; reason?: string } | null;
  if (!res?.ok) {
    const reason = res?.reason;
    const msg =
      reason === 'not_your_assignment'
        ? "This shoot isn't assigned to you."
        : reason === 'no_contractor_for_this_login'
          ? 'Your account isn’t registered as a photographer yet.'
          : reason || 'Could not save your response.';
    return NextResponse.json({ error: msg, reason }, { status: 400 });
  }

  await afterContractorResponse({
    orderId: params.id,
    response: parsed.data.response,
    note: parsed.data.note ?? null,
    source: 'portal',
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin,
  });

  return NextResponse.json({ ok: true, response: parsed.data.response });
}
