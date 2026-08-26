import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const AddBody = z.object({
  client_id: z.string().uuid(),
  role: z.enum(['admin', 'member']).optional().default('member'),
  notify_on_delivery: z.boolean().optional().default(true),
});

const PatchBody = z.object({
  member_id: z.string().uuid(),
  role: z.enum(['admin', 'member']).optional(),
  notify_on_delivery: z.boolean().optional(),
});

// Add a client to the team.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = AddBody.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });

  const { error } = await (supabase as any).from('client_team_members')
    .upsert(
      { team_id: params.id, client_id: parsed.data.client_id, role: parsed.data.role, notify_on_delivery: parsed.data.notify_on_delivery },
      { onConflict: 'team_id,client_id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Update a member's role / notification toggle.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;
  if (parsed.data.notify_on_delivery !== undefined) patch.notify_on_delivery = parsed.data.notify_on_delivery;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await (supabase as any).from('client_team_members')
    .update(patch)
    .eq('id', parsed.data.member_id)
    .eq('team_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Remove a member from the team.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const memberId = new URL(request.url).searchParams.get('member_id');
  if (!memberId) return NextResponse.json({ error: 'member_id required' }, { status: 400 });

  const { error } = await (supabase as any).from('client_team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
