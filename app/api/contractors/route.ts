import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/** Office: add a contractor photographer. Team-only (RLS "team all
 *  contractors" gates the insert; this also 401s anon). The contractor then
 *  signs in at /field with this email and link_contractor_account() binds them. */
const Body = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  phone: z.string().optional(),
  // Tiered pay (0058): small home / large home / 360 photos add-on.
  pay_rate_small_cents: z.number().int().nonnegative().default(6000),
  pay_rate_large_cents: z.number().int().nonnegative().default(7500),
  pay_rate_360_cents: z.number().int().nonnegative().default(2000),
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
  const b = parsed.data;

  // RLS ("team all contractors") lets team members insert; non-team callers are
  // rejected by the policy. Unique email → friendly duplicate message.
  const { data, error } = await supabase
    .from('contractors')
    .insert({
      email: b.email,
      full_name: b.full_name,
      phone: b.phone ?? null,
      pay_rate_small_cents: b.pay_rate_small_cents,
      pay_rate_large_cents: b.pay_rate_large_cents,
      pay_rate_360_cents: b.pay_rate_360_cents,
    })
    .select('id')
    .single();

  if (error) {
    const dup = error.code === '23505' || error.message.includes('duplicate');
    return NextResponse.json(
      { error: dup ? 'A photographer with that email already exists.' : error.message },
      { status: dup ? 409 : 500 }
    );
  }
  return NextResponse.json({ id: data.id });
}
