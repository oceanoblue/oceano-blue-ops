import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Edit or remove a team member. Admin-gated (adding/changing people is an admin
 * action, matching the Team page). Uses the admin client, so authorization is
 * explicit here.
 *
 * Guardrails:
 *  - There must always be at least one active admin — you can't demote or
 *    deactivate the last one.
 *  - Admins can't be removed/deactivated at all (change their role first).
 *  - You can't remove yourself.
 *  - Hard delete only when the member has no history (else the many NO ACTION
 *    foreign keys — orders.photographer_id, photos.uploaded_by, quotes, jobs… —
 *    would reject it and it would erase their attribution). Otherwise deactivate.
 */
const Patch = z.object({
  phone: z.string().max(40).optional(),
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(['admin', 'coordinator', 'photographer', 'editor']).optional(),
  is_active: z.boolean().optional(),
});

async function requireAdmin(userId: string, admin: any) {
  const { data: me } = await admin.from('team_members').select('role').eq('id', userId).maybeSingle();
  if (!me) return { ok: false as const, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  if (me.role !== 'admin') {
    return {
      ok: false as const,
      res: NextResponse.json({ error: 'admin_only', message: 'Only an admin can manage team members.' }, { status: 403 }),
    };
  }
  return { ok: true as const };
}

async function activeAdminCount(admin: any): Promise<number> {
  const { count } = await admin
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true);
  return count ?? 0;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const gate = await requireAdmin(user.id, admin);
  if (!gate.ok) return gate.res;

  const parsed = Patch.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  const a = parsed.data;

  const { data: target } = await admin
    .from('team_members')
    .select('id, role, is_active')
    .eq('id', params.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Guard the last admin: demoting or deactivating the final active admin locks
  // everyone out of admin actions.
  const demotingAdmin = a.role !== undefined && target.role === 'admin' && a.role !== 'admin';
  const deactivatingAdmin = a.is_active === false && target.role === 'admin';
  if ((demotingAdmin || deactivatingAdmin) && (await activeAdminCount(admin)) <= 1) {
    return NextResponse.json(
      { error: 'last_admin', message: 'There must be at least one active admin. Promote someone else first.' },
      { status: 409 }
    );
  }
  // Admins are protected from deactivation outright.
  if (a.is_active === false && target.role === 'admin' && !demotingAdmin) {
    return NextResponse.json(
      { error: 'admin_protected', message: "Admins can't be deactivated. Change their role first." },
      { status: 409 }
    );
  }
  if (a.is_active === false && params.id === user.id) {
    return NextResponse.json({ error: 'self', message: "You can't deactivate yourself." }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  if (a.phone !== undefined) patch.phone = a.phone.trim() || null;
  if (a.full_name !== undefined) patch.full_name = a.full_name.trim();
  if (a.role !== undefined) patch.role = a.role;
  if (a.is_active !== undefined) patch.is_active = a.is_active;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await admin.from('team_members').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const gate = await requireAdmin(user.id, admin);
  if (!gate.ok) return gate.res;

  if (params.id === user.id) {
    return NextResponse.json({ error: 'self', message: "You can't remove yourself." }, { status: 409 });
  }

  const { data: target } = await admin
    .from('team_members')
    .select('id, role')
    .eq('id', params.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (target.role === 'admin') {
    return NextResponse.json(
      { error: 'admin_protected', message: "Admins can't be removed. Change their role first." },
      { status: 409 }
    );
  }

  // Try the hard delete. CASCADE refs (availability, calendar, schedule blocks)
  // go with them; a NO ACTION ref (they're on an order, uploaded a photo, created
  // a quote/job…) makes Postgres reject it — that's the signal to deactivate.
  const { error } = await admin.from('team_members').delete().eq('id', params.id);
  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error:
            'This person is attached to existing orders/photos, so their record can’t be deleted. Deactivate them instead — they lose access but the history stays.',
          code: 'has_history',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Clean up the orphaned login — but only if no contractor shares it (a person
  // who is both staff and a 1099 contractor keeps their field-portal sign-in).
  const { data: sharedContractor } = await admin
    .from('contractors')
    .select('id')
    .eq('auth_user_id', params.id)
    .maybeSingle();
  if (!sharedContractor) {
    await admin.auth.admin.deleteUser(params.id).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
