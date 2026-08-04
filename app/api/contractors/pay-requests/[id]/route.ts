import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/** Office: settle a contractor pay request. The mark_pay_request_paid() RPC
 *  is team-gated via is_team_member() and flips the request AND its claimed
 *  orders to paid in one transaction. */
const Body = z.object({ paid_note: z.string().max(500).optional() });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { error } = await supabase.rpc('mark_pay_request_paid', {
    p_request_id: params.id,
    p_paid_note: parsed.data.paid_note,
  });

  if (error) {
    const status = error.message.includes('forbidden')
      ? 403
      : error.message.includes('request_not_found_or_already_paid')
        ? 404
        : 500;
    const msg = error.message.includes('request_not_found_or_already_paid')
      ? 'Request not found, or it was already marked paid.'
      : error.message;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}
