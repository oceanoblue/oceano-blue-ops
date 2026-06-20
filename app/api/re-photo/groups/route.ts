import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Real Estate Photo Rescue — manual bracket correction.
 *
 * Human overrides on the auto-detected groups. Any manual action marks the
 * resulting group as reviewed (review_required = false) since a person has
 * confirmed it. All writes go through the service-role client after an auth
 * check, mirroring app/api/photos/decide.
 */
const ROLES = ['base_exposure', 'flash', 'ambient', 'drone', 'reject', 'manual_review'] as const;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('merge'), job_id: z.string().uuid(), group_ids: z.array(z.string().uuid()).min(2) }),
  z.object({ action: z.literal('split'), group_id: z.string().uuid() }),
  z.object({ action: z.literal('create_group'), job_id: z.string().uuid(), asset_ids: z.array(z.string().uuid()).min(2) }),
  z.object({ action: z.literal('set_role'), group_id: z.string().uuid(), asset_id: z.string().uuid(), role: z.enum(ROLES) }),
  z.object({ action: z.literal('mark_reviewed'), group_id: z.string().uuid() }),
  z.object({ action: z.literal('reject_asset'), asset_id: z.string().uuid() }),
  z.object({ action: z.literal('restore_asset'), asset_id: z.string().uuid() }),
]);

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
  const body = parsed.data;
  const admin = createAdminClient() as any;
  const now = new Date().toISOString();

  const logEvent = (job_id: string, event_type: string, summary: string, details: Record<string, unknown> = {}) =>
    admin.from('production_events').insert({
      job_id,
      actor_type: 'user',
      actor_id: user.id,
      event_type,
      summary,
      details,
    });

  switch (body.action) {
    case 'merge': {
      // All selected groups must belong to the stated job — otherwise a stray
      // group_id from another job would get its assets moved and itself deleted.
      const { data: owned } = await admin
        .from('asset_groups')
        .select('id')
        .eq('job_id', body.job_id)
        .in('id', body.group_ids);
      if ((owned ?? []).length !== body.group_ids.length) {
        return NextResponse.json({ error: 'group_not_in_job' }, { status: 400 });
      }

      // Collect all items across the selected groups, build one reviewed group.
      const { data: items } = await admin
        .from('asset_group_items')
        .select('asset_id, role, sort_order')
        .in('group_id', body.group_ids);
      const assetIds = Array.from(new Set((items ?? []).map((i: any) => i.asset_id)));
      if (assetIds.length === 0) return NextResponse.json({ error: 'no_items' }, { status: 400 });

      const { data: grp, error: gErr } = await admin
        .from('asset_groups')
        .insert({
          job_id: body.job_id,
          group_type: 'real_estate_bracket',
          name: `${assetIds.length}-shot bracket`,
          confidence_score: null,
          review_required: false,
          reviewed_by: user.id,
          reviewed_at: now,
          metadata: { method: 'manual_merge', merged_from: body.group_ids },
        })
        .select('id')
        .single();
      if (gErr || !grp) return NextResponse.json({ error: gErr?.message ?? 'merge_failed' }, { status: 500 });

      await admin.from('asset_group_items').insert(
        assetIds.map((asset_id, idx) => ({ group_id: grp.id, asset_id, sort_order: idx }))
      );
      await admin.from('asset_groups').delete().in('id', body.group_ids);
      await admin.from('assets').update({ status: 'grouped' }).in('id', assetIds);
      await logEvent(body.job_id, 'brackets_merged', `Merged ${body.group_ids.length} groups`, { assetIds });
      return NextResponse.json({ ok: true, group_id: grp.id });
    }

    case 'split': {
      const { data: grp } = await admin
        .from('asset_groups')
        .select('id, job_id')
        .eq('id', body.group_id)
        .maybeSingle();
      const { data: items } = await admin
        .from('asset_group_items')
        .select('asset_id')
        .eq('group_id', body.group_id);
      const assetIds = (items ?? []).map((i: any) => i.asset_id);
      await admin.from('asset_groups').delete().eq('id', body.group_id); // items cascade
      if (assetIds.length) await admin.from('assets').update({ status: 'indexed' }).in('id', assetIds);
      if (grp?.job_id) await logEvent(grp.job_id, 'bracket_split', `Split group into ${assetIds.length} singles`, { assetIds });
      return NextResponse.json({ ok: true, freed: assetIds.length });
    }

    case 'create_group': {
      // Every asset must belong to the stated job before it can be grouped here.
      const { data: ownedAssets } = await admin
        .from('assets')
        .select('id')
        .eq('job_id', body.job_id)
        .in('id', body.asset_ids);
      if ((ownedAssets ?? []).length !== body.asset_ids.length) {
        return NextResponse.json({ error: 'asset_not_in_job' }, { status: 400 });
      }

      const { data: grp, error: gErr } = await admin
        .from('asset_groups')
        .insert({
          job_id: body.job_id,
          group_type: 'real_estate_bracket',
          name: `${body.asset_ids.length}-shot bracket`,
          confidence_score: null,
          review_required: false,
          reviewed_by: user.id,
          reviewed_at: now,
          metadata: { method: 'manual_create' },
        })
        .select('id')
        .single();
      if (gErr || !grp) return NextResponse.json({ error: gErr?.message ?? 'create_failed' }, { status: 500 });
      await admin.from('asset_group_items').insert(
        body.asset_ids.map((asset_id, idx) => ({ group_id: grp.id, asset_id, sort_order: idx }))
      );
      await admin.from('assets').update({ status: 'grouped' }).in('id', body.asset_ids);
      await logEvent(body.job_id, 'bracket_created', `Created group of ${body.asset_ids.length}`, { assetIds: body.asset_ids });
      return NextResponse.json({ ok: true, group_id: grp.id });
    }

    case 'set_role': {
      // Only act when the (group, asset) pair actually exists, so a stale or
      // mismatched asset_id can't get its status flipped to rejected.
      const { data: updated } = await admin
        .from('asset_group_items')
        .update({ role: body.role })
        .eq('group_id', body.group_id)
        .eq('asset_id', body.asset_id)
        .select('asset_id');
      if (!updated || updated.length === 0) {
        return NextResponse.json({ error: 'item_not_found' }, { status: 404 });
      }
      // Rejecting a frame also moves the asset out of the delivery set.
      if (body.role === 'reject') {
        await admin.from('assets').update({ status: 'rejected' }).eq('id', body.asset_id);
      }
      return NextResponse.json({ ok: true });
    }

    case 'mark_reviewed': {
      const { data: grp } = await admin
        .from('asset_groups')
        .update({ review_required: false, reviewed_by: user.id, reviewed_at: now })
        .eq('id', body.group_id)
        .select('job_id')
        .single();
      if (grp?.job_id) await logEvent(grp.job_id, 'bracket_reviewed', 'Marked bracket group reviewed', { group_id: body.group_id });
      return NextResponse.json({ ok: true });
    }

    case 'reject_asset': {
      const { data: rejected } = await admin
        .from('assets')
        .update({ status: 'rejected' })
        .eq('id', body.asset_id)
        .select('id, job_id');
      if (!rejected || rejected.length === 0) {
        return NextResponse.json({ error: 'asset_not_found' }, { status: 404 });
      }
      if (rejected[0].job_id) {
        await logEvent(rejected[0].job_id, 'asset_rejected', 'Rejected single asset', { asset_id: body.asset_id });
      }
      return NextResponse.json({ ok: true });
    }

    case 'restore_asset': {
      // Unarchive: move a rejected single back into the ungrouped pool.
      const { data: restored } = await admin
        .from('assets')
        .update({ status: 'indexed' })
        .eq('id', body.asset_id)
        .eq('status', 'rejected')
        .select('id, job_id');
      if (!restored || restored.length === 0) {
        return NextResponse.json({ error: 'asset_not_found' }, { status: 404 });
      }
      if (restored[0].job_id) {
        await logEvent(restored[0].job_id, 'asset_restored', 'Restored archived asset', { asset_id: body.asset_id });
      }
      return NextResponse.json({ ok: true });
    }
  }
}
