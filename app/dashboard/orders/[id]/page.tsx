import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, fmtAddress, fmtCents } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OrderStatusControl } from '@/components/orders/OrderStatusControl';
import { AssignTeamControl } from '@/components/orders/AssignTeamControl';
import { PhotoManager } from '@/components/photos/PhotoManager';
import { ProjectTypeControl } from '@/components/orders/ProjectTypeControl';
import { DeliveryControl } from '@/components/orders/DeliveryControl';
import { RawCleanupControl } from '@/components/orders/RawCleanupControl';
import { DeleteOrderControl } from '@/components/orders/DeleteOrderControl';
import { CostSummary } from '@/components/orders/CostSummary';
import { EditInstructionsEditor } from '@/components/orders/EditInstructionsEditor';
import { SendToEditEngine } from '@/components/orders/SendToEditEngine';
import { ReelFootageList, type FootageView } from '@/components/orders/ReelFootageList';
import { REEL_TYPES, ASPECTS } from '@/lib/reels/types';
import type { Json } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      listings(*),
      clients(*),
      order_services(*),
      reel_briefs(*),
      order_footage(*),
      ai_jobs(id, job_type, status, provider, model, cost_cents, duration_ms, created_at, completed_at, error_message)
    `)
    .eq('id', params.id)
    .single();

  if (error || !data) notFound();
  const order = data as any;

  // ── Reel order extras: the brief, signed footage previews, and a starter
  //    edit-instructions plan for the team to refine. ────────────────────────
  const isReel = order.order_kind === 'reel_edit';
  const brief = Array.isArray(order.reel_briefs) ? order.reel_briefs[0] : order.reel_briefs;
  let footageViews: FootageView[] = [];
  let starterPlan: Json = {};
  if (isReel) {
    const footage = (order.order_footage ?? []) as any[];
    footageViews = await Promise.all(
      footage.map(async (f) => {
        const { data: signed } = await supabase.storage
          .from(f.bucket)
          .createSignedUrl(f.storage_path, 3600);
        return {
          id: f.id,
          filename: f.filename,
          role: f.role,
          notes: f.notes,
          byte_size: f.byte_size,
          duration_seconds: f.duration_seconds,
          url: signed?.signedUrl ?? null,
        } satisfies FootageView;
      })
    );
    starterPlan = {
      reel: order.id,
      reel_type: brief?.reel_type ?? 'monologue',
      aspect: brief?.aspect ?? '1080x1920',
      timeline: (footage ?? []).map((f) => ({
        op: 'clip',
        source: f.filename,
        role: f.role || undefined,
        trim: brief?.reel_type === 'qa' ? 'auto_answer' : 'auto',
        crop: 'chest_up',
        captions: brief?.captions ?? true,
      })),
      lower_third: {
        show: brief?.lower_third ?? true,
        scope: brief?.reel_type === 'qa' ? 'answers_only' : 'persistent',
        name: brief?.subject_name ?? null,
        title: brief?.subject_title ?? null,
      },
    };
  }

  // Latest edit-engine job for this order (status + signed render URL).
  let editJobView: {
    status: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
    error: string | null;
    resultUrl: string | null;
    resultFilename: string | null;
  } | null = null;
  if (isReel) {
    const { data: ej } = await supabase
      .from('edit_jobs')
      .select('status, error, result_bucket, result_path, result_filename')
      .eq('order_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ej) {
      let resultUrl: string | null = null;
      if (ej.status === 'done' && ej.result_bucket && ej.result_path) {
        const { data: signed } = await supabase.storage
          .from(ej.result_bucket)
          .createSignedUrl(ej.result_path, 3600);
        resultUrl = signed?.signedUrl ?? null;
      }
      editJobView = {
        status: ej.status as any,
        error: ej.error,
        resultUrl,
        resultFilename: ej.result_filename,
      };
    }
  }

  // Count camera-RAW originals so the cleanup button can show the number and
  // hide itself when there are none left.
  const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;
  const { data: rawPhotos } = await supabase
    .from('photos')
    .select('filename')
    .eq('order_id', params.id)
    .eq('kind', 'raw');
  const rawOriginalsCount = ((rawPhotos ?? []) as any[]).filter((p) => RAW_EXT.test(p.filename)).length;

  // Org setting: auto-enhance bases on upload (default on).
  const { data: bizSettings } = await supabase
    .from('business_settings')
    .select('auto_enhance_on_upload')
    .eq('id', true)
    .maybeSingle();
  const autoEnhanceOnUpload = (bizSettings as any)?.auto_enhance_on_upload !== false;

  const { data: team } = await supabase
    .from('team_members')
    .select('id, full_name, role')
    .eq('is_active', true);
  const photographers = ((team ?? []) as any[]).filter((t) => t.role === 'photographer' || t.role === 'admin');
  const editors = ((team ?? []) as any[]).filter((t) => t.role === 'editor' || t.role === 'admin');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/orders" className="text-sm text-slate-500 hover:underline">← Orders</Link>
        <div className="mt-1">
          <PageHeader
            eyebrow="Order"
            icon={ClipboardList}
            title={`#${order.order_number}`}
            subtitle={order.listings && fmtAddress(order.listings)}
          >
            <StatusBadge status={order.status} />
          </PageHeader>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold mb-4">Status</h2>
            <OrderStatusControl orderId={order.id} status={order.status} />
          </section>

          {isReel ? (
            <>
              <section className="card p-6">
                <h2 className="font-semibold mb-4">Reel brief</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Row label="Type">{REEL_TYPES.find((t) => t.value === brief?.reel_type)?.label ?? '—'}</Row>
                  <Row label="Aspect">{ASPECTS.find((a) => a.value === brief?.aspect)?.label ?? brief?.aspect ?? '—'}</Row>
                  <Row label="Target length">{brief?.length_target_s ? `${brief.length_target_s}s` : '—'}</Row>
                  <Row label="Captions">{brief?.captions ? 'Yes' : 'No'}</Row>
                  <Row label="Music">{brief?.music ? 'Yes' : 'No'}</Row>
                  <Row label="Lower-third">{brief?.lower_third ? 'Yes' : 'No'}</Row>
                  <Row label="Subject">{brief?.subject_name || '—'}</Row>
                  <Row label="Title">{brief?.subject_title || '—'}</Row>
                </dl>
                {(brief?.about || brief?.must_include || brief?.must_avoid) && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">
                    {brief?.about && <Block label="About">{brief.about}</Block>}
                    {brief?.must_include && <Block label="Must include">{brief.must_include}</Block>}
                    {brief?.must_avoid && <Block label="Must avoid">{brief.must_avoid}</Block>}
                  </div>
                )}
              </section>

              <section className="card p-6">
                <h2 className="font-semibold mb-4">Footage ({footageViews.length})</h2>
                <ReelFootageList items={footageViews} />
              </section>

              <section className="card p-6">
                <h2 className="font-semibold mb-1">Edit plan</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Structured cut plan for the reel. Seeded from the brief + footage; refine before
                  the editor (or the future Resolve compiler) runs it.
                </p>
                <EditInstructionsEditor
                  orderId={order.id}
                  initial={(brief?.edit_instructions ?? null) as Json | null}
                  starter={starterPlan}
                />
              </section>

              <section className="card p-6">
                <h2 className="font-semibold mb-1">Edit engine</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Runs the saved plan on the office-Mac DaVinci Resolve daemon, then drops the
                  render here for review before delivery.
                </p>
                <SendToEditEngine
                  orderId={order.id}
                  hasPlan={Boolean(brief?.edit_instructions)}
                  job={editJobView}
                />
              </section>
            </>
          ) : (
            <section className="card p-6">
              <h2 className="font-semibold mb-4">Photos</h2>
              <ProjectTypeControl orderId={order.id} projectType={order.project_type} />
              <PhotoManager orderId={order.id} autoEnhanceOnUpload={autoEnhanceOnUpload} />
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold mb-4">Client</h2>
            <dl className="text-sm space-y-2">
              <Row label="Name">{order.clients?.full_name}</Row>
              <Row label="Email">{order.clients?.email}</Row>
              <Row label="Phone">{order.clients?.phone ?? '—'}</Row>
              <Row label="Brokerage">{order.clients?.brokerage ?? '—'}</Row>
            </dl>
          </section>

          <section className="card p-6">
            <h2 className="font-semibold mb-4">Schedule + team</h2>
            <dl className="text-sm space-y-2">
              <Row label="Scheduled">{fmtDateTime(order.scheduled_at)}</Row>
              <Row label="Duration">{order.duration_minutes} min</Row>
            </dl>
            <div className="mt-4">
              <AssignTeamControl
                orderId={order.id}
                photographerId={order.photographer_id}
                editorId={order.editor_id}
                photographers={photographers}
                editors={editors}
              />
            </div>
          </section>

          <section className="card p-6">
            <h2 className="font-semibold mb-4">Services</h2>
            {(order.order_services ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No line items.</p>
            ) : (
              <ul className="text-sm divide-y divide-slate-100">
                {order.order_services.map((s: any) => (
                  <li key={s.id} className="py-2 flex items-center justify-between">
                    <span>{s.description || s.service_type}</span>
                    <span className="text-slate-500">×{s.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 border-t pt-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">Total</span>
              <span className="font-semibold">{fmtCents(order.total_cents)}</span>
            </div>
          </section>

          <CostSummary jobs={(order.ai_jobs ?? []) as any[]} />

          <section className="card p-6">
            <h2 className="font-semibold mb-4">Delivery</h2>
            <DeliveryControl orderId={order.id} />
            {order.status === 'delivered' && rawOriginalsCount > 0 && (
              <div className="mt-4 border-t pt-4">
                <RawCleanupControl orderId={order.id} rawCount={rawOriginalsCount} />
                <p className="mt-1 text-xs text-slate-500">
                  Removes ARW / CR2 / NEF originals. Converted JPEGs and processed photos stay.
                </p>
              </div>
            )}
          </section>

          {order.client_notes && (
            <section className="card p-6">
              <h2 className="font-semibold mb-2">Client notes</h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{order.client_notes}</p>
            </section>
          )}

          <section className="card border-rose-200 p-6">
            <h2 className="mb-1 font-semibold text-rose-800">Danger zone</h2>
            <p className="mb-3 text-xs text-slate-500">
              Deletes the whole order and every file it owns (originals, JPEGs, processed). For duplicates and test shoots.
            </p>
            <DeleteOrderControl orderId={order.id} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{children}</p>
    </div>
  );
}
