import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

const PAYABLE = ['uploaded', 'processing', 'editing', 'ready', 'delivered'];

/** Office: update a contractor's contact info / rates / active flag, or
 *  settle their pay. */
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    full_name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().nullable().optional(),
    // Tiered pay (0058): small home / large home / 360 photos add-on.
    pay_rate_small_cents: z.number().int().nonnegative().optional(),
    pay_rate_large_cents: z.number().int().nonnegative().optional(),
    pay_rate_360_cents: z.number().int().nonnegative().optional(),
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
    const patch: {
      full_name?: string;
      email?: string;
      phone?: string | null;
      auth_user_id?: null;
      pay_rate_small_cents?: number;
      pay_rate_large_cents?: number;
      pay_rate_360_cents?: number;
      is_active?: boolean;
    } = {};
    if (a.full_name !== undefined) patch.full_name = a.full_name;
    if (a.phone !== undefined) patch.phone = a.phone || null;
    if (a.email !== undefined) {
      // The email IS the sign-in binding (link_contractor_account matches it).
      // On a change, drop the old auth binding so the previous login loses
      // contractor access and the new address links on its first sign-in.
      const { data: current } = await admin
        .from('contractors')
        .select('email')
        .eq('id', params.id)
        .single();
      if (current && current.email.toLowerCase() !== a.email.toLowerCase()) {
        patch.email = a.email;
        patch.auth_user_id = null;
      }
    }
    if (a.pay_rate_small_cents !== undefined) patch.pay_rate_small_cents = a.pay_rate_small_cents;
    if (a.pay_rate_large_cents !== undefined) patch.pay_rate_large_cents = a.pay_rate_large_cents;
    if (a.pay_rate_360_cents !== undefined) patch.pay_rate_360_cents = a.pay_rate_360_cents;
    if (a.is_active !== undefined) patch.is_active = a.is_active;
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });
    const { error } = await admin.from('contractors').update(patch).eq('id', params.id);
    if (error) {
      const msg = error.code === '23505' ? 'That email is already used by another photographer.' : error.message;
      return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 });
    }
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

/** Office: remove a photographer. Hard delete is only allowed when they have
 *  no shoots — deleting someone with history would cascade away their pay
 *  records (pay_requests) and orphan order links, so those get deactivated
 *  instead (is_active=false blocks portal sign-in via current_contractor_id). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
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

  const admin = createAdminClient();
  const { count, error: countError } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('contractor_id', params.id);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          'This photographer has logged shoots, so their pay history can’t be deleted. Deactivate them instead — they’ll lose portal access but the records stay.',
        code: 'has_shoots',
      },
      { status: 409 }
    );
  }

  const { error } = await admin.from('contractors').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
