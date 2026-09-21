import { RespondControl } from '@/components/field/RespondControl';
import { assignmentLabel } from '@/lib/booking/routing';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, UserRound, Receipt, MapPin, Globe, Settings2 } from 'lucide-react';
import { OrderWorkspace, OrderWorkspacePanel, OrderWorkspaceLink } from '@/components/orders/OrderWorkspace';
import { isDeliverable } from '@/lib/photos/deliverable';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, fmtDateTimeTz, fmtAddress, fmtCents } from '@/lib/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OrderServicesEditor } from '@/components/orders/OrderServicesEditor';
import { OrderStatusControl } from '@/components/orders/OrderStatusControl';
import { AssignTeamControl } from '@/components/orders/AssignTeamControl';
import { PhotoManager } from '@/components/photos/PhotoManager';
import { ProjectTypeControl } from '@/components/orders/ProjectTypeControl';
import { CaptureChecklist } from '@/components/photos/CaptureChecklist';
import { QcVerdictSummary } from '@/components/photos/QcVerdictSummary';
import { DeliveryControl } from '@/components/orders/DeliveryControl';
import { RawCleanupControl } from '@/components/orders/RawCleanupControl';
import { DeleteOrderControl } from '@/components/orders/DeleteOrderControl';
import { CostSummary } from '@/components/orders/CostSummary';
import { EditInstructionsEditor } from '@/components/orders/EditInstructionsEditor';
import { SendToEditEngine } from '@/components/orders/SendToEditEngine';
import { EditingWorkspace } from '@/components/orders/EditingWorkspace';
import { RawIntakeControl } from '@/components/orders/RawIntakeControl';
import { ProcessFromDropboxControl } from '@/components/orders/ProcessFromDropboxControl';
import { OrderProcessingProgress } from '@/components/orders/OrderProcessingProgress';
import { AssignShooterControl } from '@/components/orders/AssignShooterControl';
import { RescheduleControl } from '@/components/orders/RescheduleControl';
import { ContractorResponseNotice } from '@/components/orders/ContractorResponseNotice';
import { ArchiveOrderControl } from '@/components/orders/ArchiveOrderControl';
import { DeliverablesManager, type DeliverableRow } from '@/components/orders/DeliverablesManager';
import { ReelFootageList, type FootageView } from '@/components/orders/ReelFootageList';
import { REEL_TYPES, ASPECTS } from '@/lib/reels/types';
import type { Json } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      listings(*),
      clients(*),
      order_services(*),
      order_items(*),
      reel_briefs(*),
      order_footage(*),
      ai_jobs(id, job_type, status, provider, model, cost_cents, duration_ms, created_at, completed_at, error_message)
    `)
    .eq('id', params.id)
    .single();

  if (error || !data) notFound();
  const order = data as any;
  const [{ data: serviceProducts }, { data: paymentReviews }] = await Promise.all([
    supabase.from('products').select('id,name,base_price_cents,pricing_tiers(min_sqft,max_sqft,price_cents)').eq('is_active', true).order('sort_order'),
    (supabase as any).from('order_payment_reviews').select('session_id,amount_cents').eq('order_id', order.id).is('resolved_at', null),
  ]);

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

  // Fotello workspace counts: originals available for export, finals already in.
  let originalsCount = 0;
  let finalsCount = 0;
  if (!isReel) {
    const { count: oc } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', params.id)
      .in('kind', ['raw', 'bracket_member'])
      .eq('is_selected', true);
    originalsCount = oc ?? 0;
    const { data: finished } = await supabase.from('photos').select('id,is_hdr,ai_provider')
      .eq('order_id', params.id).in('kind', ['processed','delivered']).eq('is_selected', true);
    finalsCount = (finished ?? []).filter(isDeliverable).length;
  }

  // Non-photo deliverables (video / 360 tour / floor plan) for this listing.
  let deliverables: DeliverableRow[] = [];
  {
    const { data: dv } = await supabase
      .from('listing_deliverables')
      .select('id, kind, title, source, external_url, filename, is_published')
      .eq('listing_id', order.listing_id)
      .order('created_at', { ascending: true });
    deliverables = (dv ?? []) as DeliverableRow[];
  }

  // Latest delivery-QC verdict for an at-a-glance status (team-readable via RLS).
  const { data: latestQc } = await supabase
    .from('photo_qc_reports')
    .select('summary, created_at')
    .eq('order_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Org settings: the AI-editing kill switch (merge + enhance hidden while
  // Fotello is the interim editor) and auto-enhance-on-upload.
  const { data: bizSettings } = await supabase
    .from('business_settings')
    .select('auto_enhance_on_upload, ai_editing_enabled')
    .eq('id', true)
    .maybeSingle();
  const aiEditingEnabled = (bizSettings as any)?.ai_editing_enabled === true;
  const autoEnhanceOnUpload =
    aiEditingEnabled && (bizSettings as any)?.auto_enhance_on_upload !== false;

  const { data: team } = await supabase
    .from('team_members')
    .select('id, full_name, role')
    .eq('is_active', true);
  const photographers = ((team ?? []) as any[]).filter((t) => t.role === 'photographer' || t.role === 'admin');
  const editors = ((team ?? []) as any[]).filter((t) => t.role === 'editor' || t.role === 'admin');

  // Active contractor photographers for the assignment dropdown.
  const { data: contractorRows } = await supabase
    .from('contractors')
    .select('id, full_name, pay_rate_cents, team_member_id')
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  const contractors = (contractorRows ?? []) as any[];

  // Unified shooter list: contractors + team photographers, deduped — a person
  // linked in both tables (e.g. Karen) shows once, as the contractor.
  const shooters = [
    ...contractors.map((c) => ({
      key: `contractor:${c.id}`,
      kind: 'contractor' as const,
      id: c.id,
      name: c.full_name,
      payRateCents: c.pay_rate_cents,
      teamMemberId: c.team_member_id ?? null,
    })),
    ...photographers
      .filter((p) => !contractors.some((c) => c.team_member_id === p.id))
      .map((p) => ({ key: `team:${p.id}`, kind: 'team' as const, id: p.id, name: p.full_name })),
  ];

  const serviceItems = (order.order_items?.length ? order.order_items : order.order_services) ?? [];
  const facts = { status: order.status, archived: !!order.archived_at, scheduled: !!order.scheduled_at,
    assigned: !!(order.contractor_id || order.photographer_id), originals: originalsCount,
    finals: finalsCount, media: deliverables.filter(d => d.is_published).length, services: serviceItems.length };

  return <div className="order-workflow mx-auto max-w-[1440px] space-y-6">
    <Link href="/dashboard/orders" className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-500 hover:text-ocean-700"><ArrowLeft className="h-4 w-4"/>All orders</Link>
    <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-6 sm:px-7">
        <div className="min-w-0"><div className="mb-2 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500"><span>Order #{order.order_number}</span><StatusBadge status={order.status}/>{order.archived_at && <span>Archived</span>}</div>
          <h1 className="text-3xl leading-tight text-ink-950 sm:text-4xl">{order.listings?.address_line1 || `Order #${order.order_number}`}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4"/>{[order.listings?.address_line2, order.listings?.city, order.listings?.state, order.listings?.zip].filter(Boolean).join(', ')}</p>
        </div>
        <div className="min-w-0 break-words text-right"><p className="text-xs text-slate-500">Order total</p><p className="mt-1 text-2xl font-semibold tracking-tight text-ink-950">{fmtCents(order.total_cents)}</p><p className={`mt-1 text-xs font-medium ${order.download_paid_at?'text-emerald-700':'text-slate-500'}`}>{order.download_paid_at?'Paid':'Payment pending'}</p></div>
      </div>
      <div className="grid divide-y border-t border-slate-100 bg-slate-50/70 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <SummaryItem icon={<UserRound className="h-4 w-4"/>} label="Client" value={order.clients?.full_name || 'No client'}/>
        <SummaryItem icon={<CalendarDays className="h-4 w-4"/>} label="Appointment" value={order.scheduled_at ? fmtDateTimeTz(order.scheduled_at,order.timezone) : 'Not scheduled'}/>
        <SummaryItem icon={<Receipt className="h-4 w-4"/>} label="Booked services" value={`${serviceItems.length} service${serviceItems.length===1?'':'s'} · ${order.duration_minutes} min`}/>
      </div>
    </header>

    <OrderWorkspace facts={facts}>
      <OrderWorkspacePanel id="overview">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
          <div className="min-w-0 space-y-6">
          {paymentReviews?.length > 0 && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <strong>Payment needs review</strong>
            {paymentReviews.map((review: { session_id: string; amount_cents: number }) => <p key={review.session_id}>
              {fmtCents(review.amount_cents)} was received from an earlier or duplicate checkout. Reconcile this payment in Stripe before requesting another payment. Session: {review.session_id}
            </p>)}
          </div>}
          <OrderServicesEditor orderId={order.id} updatedAt={order.updated_at} sqft={order.listings?.sqft ?? null}
            paid={!!order.download_paid_at} total={order.total_cents ?? 0}
            items={(order.order_items?.length ? order.order_items : order.order_services) ?? []}
            products={serviceProducts ?? []} />
            <section className="card p-5 sm:p-6"><h2 className="mb-4 text-xl font-semibold">Shoot notes & access</h2>
              {(order.internal_notes || order.client_notes || order.listings?.access_notes || order.listings?.access_method) ? <div className="space-y-4">
                {order.internal_notes && <Block label="Shoot instructions">{order.internal_notes}</Block>}
                {order.client_notes && <Block label="Client notes">{order.client_notes}</Block>}
                {(order.listings?.access_notes || order.listings?.access_method) && <Block label="Property access">{order.listings.access_notes || order.listings.access_method}</Block>}
              </div> : <p className="text-sm text-slate-500">No special instructions on this order.</p>}
            </section>
            <details className="card group p-5 sm:p-6"><summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-600"><Settings2 className="h-4 w-4"/>Order settings<span className="ml-auto text-slate-400 group-open:rotate-45">+</span></summary>
              <div className="mt-5 space-y-6 border-t pt-5">
                <OrderStatusControl key={order.status} orderId={order.id} status={order.status}/>
                {!isReel && <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Advanced photo settings</summary><div className="mt-4"><ProjectTypeControl orderId={order.id} projectType={order.project_type}/><CaptureChecklist orderId={order.id} projectType={order.project_type}/></div></details>}
                <CostSummary jobs={(order.ai_jobs ?? []) as any[]}/>
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Archive order</p><p className="text-xs text-slate-500">Remove it from active work. You can restore it later.</p></div><ArchiveOrderControl orderId={order.id} archivedAt={order.archived_at ?? null}/></div>
                {order.status==='delivered' && rawOriginalsCount>0 && <RawCleanupControl orderId={order.id} rawCount={rawOriginalsCount}/>}
                <details className="border-t border-rose-100 pt-4"><summary className="cursor-pointer text-sm text-rose-700">Delete order permanently</summary><p className="my-3 text-sm text-slate-500">Deletes the order and its files. Use Archive to hide an order without losing it.</p><DeleteOrderControl orderId={order.id}/></details>
              </div>
            </details>
          </div>
          <div className="min-w-0 space-y-6">
            <section className="card p-5 sm:p-6"><h2 className="mb-4 text-xl font-semibold">Schedule & team</h2><p className={`mb-4 rounded-lg p-3 text-sm ${assignmentLabel(order).startsWith('Confirmed')?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-900'}`}>{assignmentLabel(order)}{order.assignment_due_at&&order.assignment_state==='awaiting_response'&&<span className="mt-1 block text-xs">Response due {fmtDateTimeTz(order.assignment_due_at,order.timezone)}{order.auto_dispatch?' · Backup will be checked automatically.':' · Office-managed assignment.'}</span>}</p>
            {order.assignment_round>0 && order.assignment_confirmation_mode!=='legacy' && !order.contractor_id && order.photographer_id===user?.id && ['booked','scheduled'].includes(order.status) && ['awaiting_response','confirmed'].includes(order.assignment_state) && <div className="mb-4"><RespondControl orderId={order.id} round={order.assignment_round} teamAssignment response={order.assignment_state==='confirmed' && order.assignment_confirmation_mode!=='automatic' ? 'accepted' : null} automaticallyConfirmed={order.assignment_state==='confirmed' && order.assignment_confirmation_mode==='automatic'} note={null}/></div>}
            <dl className="text-sm space-y-2">
              <Row label="Scheduled">{fmtDateTimeTz(order.scheduled_at, (order as any).timezone)}</Row>
              <Row label="Duration">{order.duration_minutes} min</Row>
            </dl>
            <div className="mt-3">
              <RescheduleControl orderId={order.id} scheduledAt={order.scheduled_at} />
            </div>
            <div className="mt-4 space-y-3">
              <AssignShooterControl
                orderId={order.id}
                currentContractorId={(order as any).contractor_id ?? null}
                currentPhotographerId={order.photographer_id}
                shooters={shooters}
              />
              <AssignTeamControl
                orderId={order.id}
                editorId={order.editor_id}
                editors={editors}
              />
              <ContractorResponseNotice
                response={(order as any).contractor_response ?? null}
                respondedAt={(order as any).contractor_responded_at ?? null}
                note={(order as any).contractor_response_note ?? null}
                contractorName={contractors.find((c) => c.id === (order as any).contractor_id)?.full_name ?? null}
              />
            </div>
            </section>
            <section className="card p-5 sm:p-6"><h2 className="mb-4 text-xl font-semibold">Client details</h2><dl className="space-y-3 text-sm">
              <Row label="Name">{order.clients?.full_name || '—'}</Row><Row label="Email">{order.clients?.email || '—'}</Row><Row label="Phone">{order.clients?.phone || '—'}</Row>{order.clients?.brokerage && <Row label="Brokerage">{order.clients.brokerage}</Row>}
            </dl><Link className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-ocean-700 hover:underline" href={`/dashboard/clients/${order.client_id}`}>Open client record →</Link></section>
          </div>
        </div>
      </OrderWorkspacePanel>

      <OrderWorkspacePanel id="upload">
        {isReel ? <div className="space-y-6">              <section className="card p-6">
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
</div> : <div className="space-y-6">
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
            <section className="card p-5 sm:p-7"><p className="mb-2 text-xs font-medium uppercase tracking-widest text-ocean-700">Finished work</p><h2 className="text-2xl font-semibold">Upload the finished photos</h2><p className="mb-6 mt-2 max-w-xl text-sm leading-relaxed text-slate-500">Edited in Fotello, Lightroom, or by your editor? Bring the final files here. They’ll be ready for review and client delivery.</p>
              <EditingWorkspace orderId={order.id} originalsCount={originalsCount} finalsCount={finalsCount}/>
              <div className="mt-6 border-t pt-5"><OrderWorkspaceLink area="review">Continue to review</OrderWorkspaceLink></div>
            </section>
            <section className="card p-5 sm:p-6"><p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">Original files</p><h2 className="text-xl font-semibold">Collect from the photographer</h2><p className="mb-5 mt-2 text-sm text-slate-500">Share the upload link so your photographer can send the shoot’s originals.</p>
              <RawIntakeControl orderId={order.id} intakeUrl={order.dropbox_intake_url ?? null} intakePath={order.dropbox_intake_path ?? null}/>
              {aiEditingEnabled && <details className="mt-5 border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Automatic processing</summary><ProcessFromDropboxControl orderId={order.id} hasIntake={!!order.dropbox_intake_path}/></details>}
              <OrderProcessingProgress orderId={order.id}/>
            </section>
          </div>
          <details className="card p-5 sm:p-6"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Upload or browse originals in the app <span className="ml-2 font-normal text-slate-500">{originalsCount} files</span></summary>
            <div className="mt-5"><PhotoManager orderId={order.id} view="originals" autoEnhanceOnUpload={autoEnhanceOnUpload} aiEditingEnabled={aiEditingEnabled} externalFinalsCount={finalsCount}/></div>
          </details>
        </div>}
      </OrderWorkspacePanel>

      <OrderWorkspacePanel id="review">
        <div className="space-y-6">
          {!isReel && <section className="card p-5 sm:p-7"><QcVerdictSummary summary={(latestQc as any)?.summary} createdAt={(latestQc as any)?.created_at}/><PhotoManager orderId={order.id} view="review" autoEnhanceOnUpload={false} aiEditingEnabled={false} externalFinalsCount={finalsCount}/></section>}
          <section className="card p-5 sm:p-7"><h2 className="text-xl font-semibold">{isReel?'Finished media':'Video, tours & floor plans'}</h2><p className="mb-5 mt-2 text-sm text-slate-500">Add links or files to include alongside the photos. Publish each item when it’s ready for the client.</p><DeliverablesManager orderId={order.id} listingId={order.listing_id} initial={deliverables}/></section>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-5 ring-1 ring-slate-200"><p className="text-sm text-slate-600">Happy with the finished work? Preview the client experience next.</p><OrderWorkspaceLink area="delivery">Continue to delivery</OrderWorkspaceLink></div>
        </div>
      </OrderWorkspacePanel>

      <OrderWorkspacePanel id="delivery">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <section className="card p-5 sm:p-7"><p className="mb-2 text-xs font-medium uppercase tracking-widest text-ocean-700">The client experience</p><h2 className="text-2xl font-semibold">Preview. Personalize. Deliver.</h2><p className="mb-6 mt-2 text-sm leading-relaxed text-slate-500">Review the gallery, choose email or text, and add a personal note. You’ll see the recipients and message before sending.</p><DeliveryControl orderId={order.id}/></section>
          <div className="space-y-6"><section className="card p-6"><Globe className="mb-4 h-6 w-6 text-ocean-700"/><h2 className="text-xl font-semibold">Property marketing</h2><p className="mb-5 mt-2 text-sm leading-relaxed text-slate-500">Create the listing’s property website and marketing materials after the media is ready.</p><Link href={`/dashboard/orders/${order.id}/website`} className="btn-secondary min-h-11">Open property website</Link></section>
            <div className="rounded-xl border border-slate-200 p-5 text-sm text-slate-600"><p className="font-medium text-ink-950">A final check</p><ul className="mt-3 space-y-2"><li>Selected photos are the ones the client receives.</li><li>Published videos and tours join the gallery.</li><li>Payment settings control download access.</li><li>Previewing a gallery does not send a message.</li></ul></div>
          </div>
        </div>
      </OrderWorkspacePanel>
    </OrderWorkspace>
  </div>;
}

function SummaryItem({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) {
  return <div className="flex min-w-0 items-center gap-3 px-5 py-4 sm:px-7"><span className="text-slate-400">{icon}</span><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-medium text-ink-900">{value}</p></div></div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
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
