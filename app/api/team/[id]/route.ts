import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Update an existing team member (currently: phone, full_name). Admin-gated.
 * Uses the admin client so it can write regardless of RLS, so the staff/admin
 * check is explicit here.
 */
const Patch = z.object({
  phone: z.string().max(40).optional(),
  full_name: z.string().min(1).max(200).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data: me } = await admin.from('team_members').select('role').eq('id', user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (me.role !== 'admin') {
    return NextResponse.json(
      { error: 'admin_only', message: 'Only an admin can edit team members.' },
      { status: 403 }
    );
  }

  const parsed = Patch.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone.trim() || null;
  if (parsed.data.full_name !== undefined) patch.full_name = parsed.data.full_name.trim();
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await admin.from('team_members').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
