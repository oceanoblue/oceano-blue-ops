import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/** Set the signed-in contractor's payout method. Ownership is re-derived
 *  inside the set_contractor_payout() RPC (SECURITY DEFINER). */
const Body = z.object({
  method: z.enum(['ach', 'zelle', 'venmo', 'paypal', 'check', 'other']),
  details: z.string().max(500).optional(),
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

  const { error } = await supabase.rpc('set_contractor_payout', {
    p_method: parsed.data.method,
    p_details: parsed.data.details,
  });

  if (error) {
    const msg = error.message.includes('not_a_contractor')
      ? 'Your account isn’t registered as a photographer yet.'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
