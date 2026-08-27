import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().min(1),
  brokerage: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

// Create a customer team (staff only — enforced by RLS on client_teams).
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  const b = parsed.data;

  const { data, error } = await (supabase as any).from('client_teams')
    .insert({ name: b.name, brokerage: b.brokerage || null, notes: b.notes || null, created_by: user.id })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
