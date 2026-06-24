import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Team action: hand a reel / long-form order to the office-Mac Resolve engine.
 * Snapshots the saved edit plan (reel_briefs.edit_instructions) into a queued
 * edit_jobs row the daemon will claim. Team-only; refuses if no plan is saved
 * or a job is already in flight.
 */
const Body = z.object({ order_id: z.string().uuid() });

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: isTeam } = await supabase.rpc('is_team_member');
  if (!isTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const admin = createAdminClient() as any;

  const { data: order } = await admin
    .from('orders')
    .select('id, order_kind, reel_briefs(edit_instructions)')
    .eq('id', parsed.data.order_id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  if (!['reel_edit', 'long_form_edit'].includes(order.order_kind)) {
    return NextResponse.json({ error: 'not_an_edit_order' }, { status: 400 });
  }
  const brief = Array.isArray(order.reel_briefs) ? order.reel_briefs[0] : order.reel_briefs;
  const plan = brief?.edit_instructions;
  if (!plan) {
    return NextResponse.json({ error: 'no_edit_plan' }, { status: 400 });
  }

  // Don't double-queue while one is queued/running.
  const { data: active } = await admin
    .from('edit_jobs')
    .select('id')
    .eq('order_id', order.id)
    .in('status', ['queued', 'running'])
    .maybeSingle();
  if (active) return NextResponse.json({ error: 'already_queued', edit_job_id: active.id }, { status: 409 });

  const { data: job, error } = await admin
    .from('edit_jobs')
    .insert({
      order_id: order.id,
      status: 'queued',
      edit_plan: plan,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error || !job) return NextResponse.json({ error: error?.message ?? 'enqueue_failed' }, { status: 500 });

  await admin.from('orders').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', order.id);

  return NextResponse.json({ ok: true, edit_job_id: job.id });
}
