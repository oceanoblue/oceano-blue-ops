import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

const PAYABLE = ['uploaded', 'processing', 'editing', 'ready', 'delivered'];

/** Office: update a contractor's rate / active flag, or settle their pay. */
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    pay_rate_cents: z.number().int().nonnegative().optional(),
    is_active: z.boolean().optional(),
  }),
  // Mark all of this contractor's completed-but-unpaid shoots as paid.
  z.object({ action: z.literal('mark_paid') }),
]);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Team gate: only a team member resolves a contractor row via RLS.
  const { data: contractor } = await supabase
    .from('contractors')
    .select('id')
    .eq('id', params.id)
    .maybeSingle();
  if (!contractor) return NextResponse.json({ error: 'not_found_or_forbidden' }, { status: 404 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const a = parsed.data;
  const admin = createAdminClient();

  if (a.action === 'update') {
    const patch: { pay_rate_cents?: number; is_active?: boolean } = {};
    if (a.pay_rate_cents !== undefined) patch.pay_rate_cents = a.pay_rate_cents;
    if (a.is_active !== undefined) patch.is_active = a.is_active;
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });
    const { error } = await admin.from('contractors').update(patch).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // mark_paid — settle completed, unpaid shoots for this contractor.
  const { data: updated, error } = await admin
    .from('orders')
    .update({ pay_status: 'paid' })
    .eq('contractor_id', params.id)
    .eq('pay_status', 'unpaid')
    .in('status', PAYABLE as any)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A blanket settle covers any open weekly pay requests too — close them so
  // the contractor's portal history doesn't show a paid week as pending.
  const { error: reqError } = await admin
    .from('pay_requests')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('contractor_id', params.id)
    .eq('status', 'submitted');
  if (reqError) return NextResponse.json({ error: reqError.message }, { status: 500 });

  return NextResponse.json({ ok: true, paid: updated?.length ?? 0 });
}
