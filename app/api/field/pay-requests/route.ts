import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Submit a weekly pay request for the signed-in contractor. Ownership and
 * shoot eligibility are re-derived inside the submit_pay_request() RPC
 * (SECURITY DEFINER) — the caller's order list is filtered server-side to
 * their own unpaid, unclaimed, payable shoots, and the amount comes from the
 * pay_amount_cents snapshots, never from the client.
 */
const Body = z.object({
  order_ids: z.array(z.string().uuid()).min(1),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data: requestId, error } = await supabase.rpc('submit_pay_request', {
    p_order_ids: parsed.data.order_ids,
    p_notes: parsed.data.notes,
  });

  if (error) {
    const msg = error.message.includes('not_a_contractor')
      ? 'Your account isn’t registered as a photographer yet.'
      : error.message.includes('no_eligible_shoots')
        ? 'None of those shoots can be requested — they may already be requested, paid, or still waiting on RAW uploads.'
        : error.message.includes('no_shoots_selected')
          ? 'Select at least one shoot.'
          : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ request_id: requestId });
}
