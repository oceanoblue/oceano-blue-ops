import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createClient } from '@/lib/supabase/server';
const schema = z.object({ status: z.enum(['open','in_progress','resolved']), staff_response: z.string().trim().max(2000) });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireTeamMember();
  if (gate.error) return gate.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status or response.' }, { status: 400 });
  const { id } = await context.params;
  const client = await createClient();
  const { data, error } = await (client as any).from('gallery_revision_requests').update(parsed.data).eq('id', id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to save request.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
