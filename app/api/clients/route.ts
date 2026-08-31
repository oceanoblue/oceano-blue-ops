import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Create a client (agent) directly — the internal "Add client" path. Until now
 * clients only got created as a side effect of the public booking flow, so a
 * listing for an agent who never booked online couldn't be started. This closes
 * that gap.
 */
const Body = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  brokerage: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: isStaff } = await supabase.rpc('is_team_member');
  if (!isStaff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('clients')
    .insert({
      full_name: b.full_name.trim(),
      email: b.email.toLowerCase().trim(),
      phone: b.phone.trim() || null,
      brokerage: b.brokerage.trim() || null,
      notes: b.notes.trim() || null,
      is_archived: false,
    })
    .select('id, full_name, brokerage')
    .single();

  if (error) {
    // Unique violation on email — the agent already exists.
    if ((error as any).code === '23505') {
      const { data: existing } = await admin
        .from('clients')
        .select('id, full_name, brokerage')
        .eq('email', b.email.toLowerCase().trim())
        .maybeSingle();
      return NextResponse.json(
        {
          error: 'duplicate_email',
          message: 'A client with this email already exists.',
          client: existing ?? null,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ client_id: (data as any).id, client: data });
}
