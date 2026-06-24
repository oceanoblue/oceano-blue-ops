import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, LayoutGrid, Images } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { signThumbnails } from '@/lib/photos/thumbnails-server';
import { IngestPanel } from '@/components/photos/rescue/IngestPanel';
import { GroupReviewList, type ReviewGroup, type Single } from '@/components/photos/rescue/GroupReviewList';
import { QcPanel } from '@/components/photos/rescue/QcPanel';
import { ClassifyButton } from '@/components/photos/rescue/ClassifyButton';
import { GenerateThumbsButton } from '@/components/photos/rescue/GenerateThumbsButton';
import { RedetectButton } from '@/components/photos/rescue/RedetectButton';
import { ProcessPanel, type ProcessedAsset, type ProcessTask } from '@/components/photos/rescue/ProcessPanel';
import { ProductionFlowSummary } from '@/components/photos/rescue/ProductionFlowSummary';

export const dynamic = 'force-dynamic';

/** Parse exposure bias from an asset's EXIF for display. */
function exposureBias(exif: any): number | null {
  const v = exif?.ExposureBiasValue;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const m = String(v).match(/(-?\d+)(?:\/(\d+))?/);
  if (!m) return null;
  return Number(m[1]) / (m[2] ? Number(m[2]) : 1);
}

export default async function PhotoRescuePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, next_action, job_types(key, name)')
    .eq('id', params.id)
    .maybeSingle();
  if (!job) notFound();
  const j = job as any;

  const [{ data: groupsData }, { data: assetsData }, { data: qcData }, { data: processTasksData }] = await Promise.all([
    supabase
      .from('asset_groups')
      .select(
        'id, name, confidence_score, review_required, metadata, items:asset_group_items(asset_id, role, sort_order, asset:assets(filename, status, exif, thumbnail_url, metadata))'
      )
      .eq('job_id', params.id),
    supabase
      .from('assets')
      .select('id, filename, status, thumbnail_url, metadata, asset_type')
      .eq('job_id', params.id),
    supabase
      .from('qc_reports')
      .select('status, quality_score, checks, created_at')
      .eq('job_id', params.id)
      .eq('qc_type', 'real_estate_photo_qc')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('worker_tasks')
      .select('id, status, error, result, created_at')
      .eq('job_id', params.id)
      .eq('task_type', 'process_photos')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  // Sign every thumbnail path once.
  const allPaths: Array<string | null> = [
    ...(assetsData ?? []).map((a: any) => a.thumbnail_url),
    ...(groupsData ?? []).flatMap((g: any) => (g.items ?? []).map((it: any) => it.asset?.thumbnail_url)),
  ];
  const thumbs = await signThumbnails(supabase, allPaths);
  const sourceAssets = (assetsData ?? []).filter((a: any) => a.asset_type !== 'processed');
  const outputAssets = (assetsData ?? []).filter((a: any) => a.asset_type === 'processed');

  const groupedAssetIds = new Set<string>();
  const groups: ReviewGroup[] = (groupsData ?? []).map((g: any) => {
    const items = [...(g.items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    items.forEach((it: any) => groupedAssetIds.add(it.asset_id));
    return {
      id: g.id,
      name: g.name,
      confidence_score: g.confidence_score == null ? null : Number(g.confidence_score),
      review_required: g.review_required,
      method: g.metadata?.method ?? null,
      reason: g.metadata?.reason ?? null,
      items: items.map((it: any) => ({
        asset_id: it.asset_id,
        role: it.role,
        sort_order: it.sort_order,
        filename: it.asset?.filename ?? it.asset_id,
        status: it.asset?.status ?? 'indexed',
        exposure_bias: exposureBias(it.asset?.exif),
        thumb_url: it.asset?.thumbnail_url ? thumbs[it.asset.thumbnail_url] ?? null : null,
        scene: it.asset?.metadata?.scene ?? null,
      })),
    };
  });

  // Surface uncertain groups first.
  groups.sort((a, b) => Number(b.review_required) - Number(a.review_required));

  const singles: Single[] = sourceAssets
    .filter((a: any) => !groupedAssetIds.has(a.id))
    .map((a: any) => ({
      id: a.id,
      filename: a.filename ?? a.id,
      status: a.status,
      thumb_url: a.thumbnail_url ? thumbs[a.thumbnail_url] ?? null : null,
      scene: a.metadata?.scene ?? null,
    }));

  const processedOutputs: ProcessedAsset[] = outputAssets.map((a: any) => ({
    id: a.id,
    filename: a.filename ?? a.id,
    status: a.status,
    thumb_url: a.thumbnail_url ? thumbs[a.thumbnail_url] ?? null : null,
    processing_kind: a.metadata?.processing_kind ?? null,
    profile: a.metadata?.profile ?? null,
  }));

  const processTasks: ProcessTask[] = (processTasksData ?? []).map((t: any) => ({
    id: t.id,
    status: t.status,
    error: t.error ?? null,
    created_at: t.created_at,
    result: t.result ?? null,
  }));

  const latestQc = (qcData ?? [])[0]
    ? {
        status: (qcData as any)[0].status,
        quality_score: (qcData as any)[0].quality_score,
        checks: (qcData as any)[0].checks ?? [],
        created_at: (qcData as any)[0].created_at,
      }
    : null;

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/jobs/${j.id}`} className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to job
      </Link>
      <PageHeader
        eyebrow="Photo Production"
        title="Real Estate Photo Production"
        subtitle={<>{j.title} · <span className="capitalize">{j.status?.replace(/_/g, ' ')}</span></>}
        icon={Images}
      >
        <RedetectButton jobId={j.id} />
        <GenerateThumbsButton jobId={j.id} />
        <ClassifyButton jobId={j.id} />
        <Link href={`/dashboard/jobs/${j.id}/photo-rescue/contact-sheet`} className="btn-secondary">
          <LayoutGrid className="h-4 w-4" /> Contact sheet
        </Link>
      </PageHeader>

      <ProductionFlowSummary
        counts={{
          sources: sourceAssets.length,
          groups: groups.length,
          groupsNeedingReview: groups.filter((g) => g.review_required).length,
          singles: singles.filter((s) => s.status !== 'rejected').length,
          outputs: processedOutputs.length,
          qcStatus: latestQc?.status ?? null,
        }}
      />

      <IngestPanel jobId={j.id} />
      <GroupReviewList jobId={j.id} groups={groups} singles={singles} />
      <ProcessPanel jobId={j.id} outputs={processedOutputs} tasks={processTasks} />
      <QcPanel jobId={j.id} latest={latestQc} />
    </div>
  );
}
