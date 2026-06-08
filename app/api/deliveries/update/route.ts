import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Update a delivery version's status / link / notes (owner action). This records
 * the human decision — it performs NO external send or public publish. Moving to
 * `delivered`/`published` stamps the actor + time but does not email a client or
 * make anything public (that happens in the external tool).
 */
const STATUSES = [
  'draft', 'internal_review', 'client_review', 'changes_requested',
  'approved', 'delivered', 'published', 'archived',
] as const;

const Body = z.object({
  delivery_id: z.string().uuid(),
  status: z.enum(STATUSES).optional(),
  external_url: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { delivery_id, status, external_url, notes } = parsed.data;
  const admin = createAdminClient() as any;

  const { data: existing } = await admin
    .from('delivery_versions')
    .select('id, job_id, status')
    .eq('id', delivery_id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'delivery_not_found' }, { status: 404 });

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (external_url !== undefined) patch.external_url = external_url || null;
  if (notes !== undefined) patch.notes = notes;
  if (status === 'approved' || status === 'published') {
    patch.approved_by = user.id;
    patch.approved_at = now;
  }
  if (status === 'delivered') patch.delivered_at = now;

  const { error } = await admin.from('delivery_versions').update(patch).eq('id', delivery_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status && status !== existing.status) {
    await admin.from('production_events').insert({
      job_id: existing.job_id,
      actor_type: 'user',
      actor_id: user.id,
      event_type: 'delivery_status_changed',
      summary: `Delivery → ${status.replace(/_/g, ' ')}`,
      details: { delivery_id, from: existing.status, to: status },
    });
  }

  return NextResponse.json({ ok: true });
}
