import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  name: z.string().min(1).optional(),
  brokerage: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Patch.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.brokerage !== undefined) patch.brokerage = parsed.data.brokerage || null;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes || null;

  const { error } = await (supabase as any).from('client_teams').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Cascades to client_team_members via FK.
  const { error } = await (supabase as any).from('client_teams').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
