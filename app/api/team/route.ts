import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Add a team member — the one flow a browser can't do alone. team_members.id is
 * an FK to auth.users, so this service-key route: (1) creates the auth user via
 * the Auth admin API (silent — no invite email), (2) inserts the team_members
 * row with that id, (3) inserts the chosen team_availability rows. Step 3 is the
 * trap the handoff flagged: a member with no availability is silently
 * unschedulable, so we surface a warning if none was set. Admin-gated; rolls the
 * auth user back if the team_members insert fails.
 */
const Avail = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_local: z.string().regex(/^\d{2}:\d{2}$/),
  end_local: z.string().regex(/^\d{2}:\d{2}$/),
});

const Body = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  role: z.enum(['admin', 'coordinator', 'photographer', 'editor']).default('photographer'),
  timezone: z.string().optional().default('America/New_York'),
  availability: z.array(Avail).default([]),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;

  // Admin gate — adding people is an admin action.
  const { data: me } = await admin.from('team_members').select('role').eq('id', user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (me.role !== 'admin') {
    return NextResponse.json(
      { error: 'admin_only', message: 'Only an admin can add team members.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;
  const email = b.email.toLowerCase().trim();

  // 1) Create the auth user. createUser is silent (unlike inviteUserByEmail) —
  //    no email goes out; they sign in with the normal magic link when ready.
  //    The admin client is service-role, so its auth.admin API is authorized.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (authErr || !created?.user) {
    const dup = /already|registered|exists/i.test(authErr?.message ?? '');
    return NextResponse.json(
      {
        error: dup ? 'email_taken' : authErr?.message ?? 'auth_create_failed',
        message: dup ? 'That email already has an account.' : undefined,
      },
      { status: dup ? 409 : 500 }
    );
  }
  const uid = created.user.id;

  // 2) Insert the team_members row. Roll the auth user back on failure so a
  //    failed add doesn't leave an orphan login.
  const { error: tmErr } = await admin.from('team_members').insert({
    id: uid,
    email,
    full_name: b.full_name.trim(),
    role: b.role,
    phone: b.phone.trim() || null,
    is_active: true,
  });
  if (tmErr) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    const dup = tmErr.code === '23505';
    return NextResponse.json(
      {
        error: dup ? 'email_taken' : tmErr.message,
        message: dup ? 'A team member with that email already exists.' : undefined,
      },
      { status: dup ? 409 : 500 }
    );
  }

  // 3) Availability — without rows the scheduler never picks them.
  let availabilityWarning: string | null = null;
  if (b.availability.length) {
    const rows = b.availability.map((a) => ({
      team_member_id: uid,
      day_of_week: a.day_of_week,
      start_local: a.start_local,
      end_local: a.end_local,
      timezone: b.timezone,
      is_active: true,
    }));
    const { error: avErr } = await admin.from('team_availability').insert(rows);
    if (avErr) availabilityWarning = avErr.message;
  } else {
    availabilityWarning = 'no_availability_set';
  }

  return NextResponse.json({ id: uid, availability_warning: availabilityWarning });
}
