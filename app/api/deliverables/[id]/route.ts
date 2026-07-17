import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/** Office: toggle publish or delete a deliverable. Team-only. */
const Body = z.object({ is_published: z.boolean() });

async function requireTeam(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from('team_members').select('id').eq('id', userId).maybeSingle();
  return Boolean(data);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await requireTeam(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('listing_deliverables')
    .update({ is_published: parsed.data.is_published })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await requireTeam(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();
  // Remove the stored file too (external-URL rows have nothing to clean up).
  const { data: row } = await admin
    .from('listing_deliverables')
    .select('bucket, storage_path')
    .eq('id', params.id)
    .maybeSingle();
  if (row?.bucket && row.storage_path) {
    await admin.storage.from(row.bucket).remove([row.storage_path]);
  }
  const { error } = await admin.from('listing_deliverables').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
