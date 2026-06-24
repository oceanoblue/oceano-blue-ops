import path from 'path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const Body = z.object({
  job_id: z.string().uuid(),
  profile: z.enum(['natural', 'airy', 'luxury']).default('natural'),
  worker_id: z.string().uuid().optional(),
  include_singles: z.boolean().default(true),
  force: z.boolean().default(false),
});

type ProcessItem = {
  id: string;
  kind: 'bracket' | 'single';
  group_id?: string;
  output_name: string;
  source_asset_ids: string[];
  files: Array<{
    asset_id: string;
    filename: string;
    local_path: string;
    exposure_bias: number | null;
    role: string | null;
  }>;
};

const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;

function exposureBias(exif: any): number | null {
  const v = exif?.ExposureBiasValue;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const m = String(v).match(/(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  return Number(m[1]) / (m[2] ? Number(m[2]) : 1);
}

function cleanName(name: string | null | undefined, fallback: string) {
  return (name || fallback || 'photo')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'photo';
}

function signature(ids: string[]) {
  return ids.slice().sort().join('|');
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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

  const { job_id, profile, worker_id, include_singles, force } = parsed.data;
  const admin = createAdminClient() as any;

  const { data: job } = await admin
    .from('jobs')
    .select('id, title, job_types(key)')
    .eq('id', job_id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'job_not_found' }, { status: 404 });
  if (job.job_types?.key !== 'real_estate_photo') {
    return NextResponse.json({ error: 'not_real_estate_photo_job' }, { status: 400 });
  }

  const [{ data: groupsData }, { data: assetsData }, { data: processedData }] = await Promise.all([
    admin
      .from('asset_groups')
      .select(
        'id, name, review_required, items:asset_group_items(asset_id, role, sort_order, asset:assets(id, filename, status, exif, local_path, asset_type))'
      )
      .eq('job_id', job_id)
      .eq('group_type', 'real_estate_bracket'),
    admin
      .from('assets')
      .select('id, filename, status, exif, local_path, asset_type')
      .eq('job_id', job_id)
      .eq('media_type', 'photo'),
    admin
      .from('assets')
      .select('id, metadata')
      .eq('job_id', job_id)
      .eq('asset_type', 'processed'),
  ]);

  const alreadyProcessed = new Set(
    (processedData ?? [])
      .map((a: any) => a.metadata?.source_asset_ids)
      .filter(Array.isArray)
      .map((ids: string[]) => signature(ids))
  );

  const groupedAssetIds = new Set<string>();
  const processItems: ProcessItem[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const group of groupsData ?? []) {
    const items = [...(group.items ?? [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    items.forEach((it: any) => groupedAssetIds.add(it.asset_id));

    if (group.review_required) {
      skipped.push({ id: group.id, reason: 'review_required' });
      continue;
    }

    const files = items
      .filter((it: any) => it.role !== 'reject' && it.asset?.status !== 'rejected')
      .map((it: any) => ({
        asset_id: it.asset_id,
        filename: it.asset?.filename ?? it.asset_id,
        local_path: it.asset?.local_path,
        exposure_bias: exposureBias(it.asset?.exif),
        role: it.role ?? null,
      }))
      .filter((f: any) => f.local_path);

    if (files.length < 2) {
      skipped.push({ id: group.id, reason: 'not_enough_local_files' });
      continue;
    }
    if (files.some((f: any) => RAW_EXT.test(f.filename || f.local_path))) {
      skipped.push({ id: group.id, reason: 'raw_requires_conversion_first' });
      continue;
    }

    const sourceIds = files.map((f: any) => f.asset_id);
    if (!force && alreadyProcessed.has(signature(sourceIds))) {
      skipped.push({ id: group.id, reason: 'already_processed' });
      continue;
    }

    processItems.push({
      id: group.id,
      kind: 'bracket',
      group_id: group.id,
      output_name: cleanName(group.name, files[0]?.filename ?? group.id),
      source_asset_ids: sourceIds,
      files,
    });
  }

  if (include_singles) {
    for (const asset of assetsData ?? []) {
      if (asset.asset_type === 'processed') continue;
      if (groupedAssetIds.has(asset.id)) continue;
      if (asset.status === 'rejected') continue;
      if (!asset.local_path) {
        skipped.push({ id: asset.id, reason: 'missing_local_path' });
        continue;
      }
      if (RAW_EXT.test(asset.filename ?? asset.local_path)) {
        skipped.push({ id: asset.id, reason: 'raw_requires_conversion_first' });
        continue;
      }
      if (!force && alreadyProcessed.has(signature([asset.id]))) {
        skipped.push({ id: asset.id, reason: 'already_processed' });
        continue;
      }
      processItems.push({
        id: asset.id,
        kind: 'single',
        output_name: cleanName(asset.filename, path.basename(asset.local_path)),
        source_asset_ids: [asset.id],
        files: [
          {
            asset_id: asset.id,
            filename: asset.filename ?? asset.id,
            local_path: asset.local_path,
            exposure_bias: exposureBias(asset.exif),
            role: null,
          },
        ],
      });
    }
  }

  if (processItems.length === 0) {
    return NextResponse.json(
      {
        error: 'nothing_to_process',
        skipped,
        hint: 'Review all bracket groups and make sure source files are local JPEG/TIFF/HEIC/PNG/WebP assets.',
      },
      { status: 400 }
    );
  }

  const rows = chunk(processItems, 8).map((items) => ({
    job_id,
    worker_id: worker_id ?? null,
    task_type: 'process_photos',
    status: 'queued',
    payload: { profile, items },
  }));

  const { data: tasks, error } = await admin.from('worker_tasks').insert(rows).select('id');
  if (error || !tasks) {
    return NextResponse.json({ error: error?.message ?? 'enqueue_failed' }, { status: 500 });
  }

  await admin.from('jobs').update({ status: 'processing', next_action: 'Local worker processing queued' }).eq('id', job_id);
  await admin.from('production_events').insert({
    job_id,
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'photo_processing_queued',
    summary: `Queued ${processItems.length} photo processing item(s)`,
    details: {
      task_ids: tasks.map((t: any) => t.id),
      profile,
      skipped,
    },
  });

  return NextResponse.json({
    ok: true,
    queued: tasks.map((t: any) => t.id),
    items: processItems.length,
    skipped,
  });
}
