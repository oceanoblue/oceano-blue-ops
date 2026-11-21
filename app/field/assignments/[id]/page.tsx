import Link from 'next/link';
import { redirect } from 'next/navigation';
import { validate as isUuid } from 'uuid';
import { RespondControl } from '@/components/field/RespondControl';
import { ServiceChecklist } from '@/components/field/ServiceChecklist';
import { PortalHero } from '@/components/portal/PortalHero';
import { roleWindow, CREW_WINDOW_COLUMNS } from '@/lib/booking/crew-windows';
import { assignmentLabel } from '@/lib/booking/routing';
import { SERVICE_SCOPE_COLUMNS, serviceScope } from '@/lib/field/service-scope';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fmtDateTimeTz } from '@/lib/utils/format';
import { fmtTimeInTz } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

function ClosedOffer({ expired = false, adminOrderId }: { expired?: boolean; adminOrderId?: string }) {
  return <div className="min-h-screen bg-slate-50">
    <PortalHero eyebrow="Shoot assignment" title={expired ? 'Response window closed' : 'Offer unavailable'} />
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="card space-y-4 p-5">
        <p>{expired
          ? 'The deadline to respond to this offer has passed.'
          : 'This link no longer has an open offer for your account. The offer may have expired or the assignment may have changed.'}</p>
        {adminOrderId
          ? <Link href={`/dashboard/orders/${adminOrderId}`} className="btn-primary inline-flex">Review assignment in Ops</Link>
          : <p className="text-sm text-slate-600">If you’re available for the shoot, contact the office to check who’s covering it.</p>}
      </div>
    </main>
  </div>;
}

export default async function TeamAssignmentPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string | string[] }>;
}) {
  const { id } = await params;
  const { round } = await searchParams;
  if (!isUuid(id) || (round !== undefined && (typeof round !== 'string' || !/^[1-9]\d*$/.test(round)))) {
    return <ClosedOffer />;
  }

  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    const next = `/field/assignments/${id}${round ? `?round=${round}` : ''}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const admin = createAdminClient() as any;
  const { data: staff, error: staffError } = await admin.from('team_members')
    .select('role,is_active').eq('id', user.id).maybeSingle();
  if (staffError) throw new Error('Could not load team membership.');
  if (!staff?.is_active || !['admin', 'photographer'].includes(staff.role)) return <ClosedOffer />;

  // Detailed order data is only for the current assignee, even for an admin using an offer link.
  const { data: order, error } = await admin.from('orders')
    .select(CREW_WINDOW_COLUMNS+',duration_minutes,auto_dispatch,id,status,scheduled_at,timezone,photographer_id,contractor_id,assignment_state,assignment_round,assignment_confirmation_mode,assignment_due_at,listings(address_line1,city,state,zip),'+SERVICE_SCOPE_COLUMNS)
    .eq('id', id).eq('photographer_id', user.id).is('contractor_id', null).is('archived_at', null).maybeSingle();
  if (error) throw new Error('Could not load the assignment.');
  const adminOrderId = staff.role === 'admin' ? id : undefined;
  if (!order || (round !== undefined && round !== String(order.assignment_round))) {
    return <ClosedOffer adminOrderId={adminOrderId} />;
  }

  const now = Date.now();
  const awaiting = order.assignment_state === 'awaiting_response';
  const confirmed = order.assignment_state === 'confirmed';
  const manualReview = order.assignment_state === 'needs_attention' && !order.auto_dispatch;
  const shootIsUpcoming = Date.parse(order.scheduled_at) > now;
  const withinDeadline = Date.parse(order.assignment_due_at) > now;
  if (awaiting && (!shootIsUpcoming || (order.auto_dispatch && !withinDeadline))) {
    return <ClosedOffer expired adminOrderId={adminOrderId} />;
  }
  if (!awaiting && !confirmed && !manualReview) return <ClosedOffer adminOrderId={adminOrderId} />;

  // An unanswered manual offer can still be accepted after the office review deadline.
  if (manualReview) {
    const { data: previousResponse, error: responseError } = await admin.from('assignment_dispatch_events')
      .select('event').eq('order_id', id).eq('round', order.assignment_round)
      .in('event', ['accepted_by_photographer', 'declined_by_photographer']).limit(1).maybeSingle();
    if (responseError) throw new Error('Could not load the assignment response.');
    if (previousResponse || !shootIsUpcoming) return <ClosedOffer adminOrderId={adminOrderId} />;
  }

  const listing = order.listings || {};
  const canRespond = shootIsUpcoming && order.assignment_round > 0 &&
    order.assignment_confirmation_mode !== 'legacy' && ['booked', 'scheduled'].includes(order.status);
  const visit = roleWindow(order, 'photographer');
  return <div className="min-h-screen bg-slate-50">
    <PortalHero eyebrow="Your assignment" title={listing.address_line1 || 'Shoot'} subtitle={[listing.city,listing.state,listing.zip].filter(Boolean).join(', ')} />
    <main className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <ServiceChecklist scope={serviceScope(order)} />
      <section className="card space-y-4 p-5">
        <p className="font-medium">{fmtDateTimeTz(visit.start,order.timezone)}{visit.end&&`–${fmtTimeInTz(visit.end,order.timezone)}`}</p>
        <p className="text-sm text-slate-600">{assignmentLabel(order)}</p>
        {awaiting && withinDeadline && <p className="text-sm text-amber-800">Respond by {fmtDateTimeTz(order.assignment_due_at,order.timezone)}.</p>}
        {!order.auto_dispatch && canRespond && (manualReview || (awaiting && !withinDeadline)) &&
          <p className="text-sm text-slate-600">The office still has this shoot assigned to you. You can respond below.</p>}
        {canRespond && <RespondControl orderId={order.id} round={order.assignment_round} teamAssignment response={confirmed && order.assignment_confirmation_mode!=='automatic' ? 'accepted' : null} automaticallyConfirmed={confirmed && order.assignment_confirmation_mode==='automatic'} note={null}/>}
      </section>
    </main>
  </div>;
}
