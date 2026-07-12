import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/** Batch lifecycle actions for the Fotello loop. Status flow:
 *  export_ready → sent → returned → closed (close is always manual —
 *  bracket sets mean returned-file count ≠ exported count, so no count
 *  can decide completeness). */
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_sent'), external_url: z.string().url().optional() }),
  z.object({ action: z.literal('set_url'), external_url: z.string().url() }),
  z.object({ action: z.literal('close') }),
]);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from('external_edit_batches')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: 'batch_not_found' }, { status: 404 });

  const a = parsed.data;
  const update: { status?: string; sent_at?: string; external_url?: string } = {};
  if (a.action === 'mark_sent') {
    update.status = 'sent';
    update.sent_at = new Date().toISOString();
    if (a.external_url) update.external_url = a.external_url;
  } else if (a.action === 'set_url') {
    update.external_url = a.external_url;
  } else if (a.action === 'close') {
    update.status = 'closed';
  }

  const { error: upErr } = await admin
    .from('external_edit_batches')
    .update(update)
    .eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** Delete an abandoned batch. Only before anything was imported — after
 *  import the batch is the audit trail for the round trip. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from('external_edit_batches')
    .select('id, imported_count')
    .eq('id', params.id)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: 'batch_not_found' }, { status: 404 });
  if (batch.imported_count > 0) {
    return NextResponse.json({ error: 'batch_has_imports' }, { status: 409 });
  }

  const { error } = await admin.from('external_edit_batches').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
