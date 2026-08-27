import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Edit a client's details — name, email, phone, brokerage, notes. The DB has
 * always allowed this (clients carry a FOR ALL policy gated on is_team_member);
 * there was simply no form or route. Team-gated; writes via the admin client.
 */
const Body = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  brokerage: z.string().optional(),
  notes: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;

  // Team gate — office staff only.
  const { data: teamRow } = await admin
    .from('team_members')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!teamRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;

  const patch: Record<string, string | null> = {};
  if (b.full_name !== undefined) patch.full_name = b.full_name.trim();
  if (b.email !== undefined) patch.email = b.email.toLowerCase().trim();
  if (b.phone !== undefined) patch.phone = b.phone.trim() || null;
  if (b.brokerage !== undefined) patch.brokerage = b.brokerage.trim() || null;
  if (b.notes !== undefined) patch.notes = b.notes.trim() || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await admin.from('clients').update(patch).eq('id', params.id);
  if (error) {
    const dup = (error as any).code === '23505' || /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      { error: dup ? 'email_taken' : error.message, message: dup ? 'Another client already uses that email.' : undefined },
      { status: dup ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
