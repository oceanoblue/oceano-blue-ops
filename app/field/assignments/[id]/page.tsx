import { notFound, redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { RespondControl } from '@/components/field/RespondControl';
import { PortalHero } from '@/components/portal/PortalHero';
import { assignmentLabel } from '@/lib/booking/routing';
import { fmtDateTimeTz } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function TeamAssignmentPage({params}: {params:Promise<{id:string}>}) {
  const {id} = await params;
  const client = await createClient();
  const {data:{user}} = await client.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/field/assignments/${id}`)}`);
  const admin = createAdminClient() as any;
  const {data:staff} = await admin.from('team_members').select('role,is_active').eq('id',user.id).single();
  if (!staff?.is_active || !['admin','photographer'].includes(staff.role)) notFound();
  // Privileged read is explicitly scoped to the authenticated assignee.
  const {data:order} = await admin.from('orders').select('id,status,scheduled_at,timezone,photographer_id,contractor_id,assignment_state,assignment_round,assignment_confirmation_mode,assignment_due_at,listings(address_line1,city,state,zip)')
    .eq('id',id).eq('photographer_id',user.id).is('contractor_id',null).is('archived_at',null).maybeSingle();
  if (!order) notFound();
  const listing = order.listings || {};
  const live = order.assignment_round>0 && ['booked','scheduled'].includes(order.status) && ['awaiting_response','confirmed'].includes(order.assignment_state);
  return <div className="min-h-screen bg-slate-50">
    <PortalHero eyebrow="Your assignment" title={listing.address_line1 || 'Shoot'} subtitle={[listing.city,listing.state,listing.zip].filter(Boolean).join(', ')} />
    <main className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <section className="card space-y-4 p-5">
        <p className="font-medium">{fmtDateTimeTz(order.scheduled_at,order.timezone)}</p>
        <p className="text-sm text-slate-600">{assignmentLabel(order)}</p>
        {order.assignment_state==='awaiting_response' && order.assignment_due_at && <p className="text-sm text-amber-800">Respond by {fmtDateTimeTz(order.assignment_due_at,order.timezone)}.</p>}
        {live && <RespondControl orderId={order.id} round={order.assignment_round} teamAssignment response={order.assignment_state==='confirmed' && order.assignment_confirmation_mode!=='automatic' ? 'accepted' : null} automaticallyConfirmed={order.assignment_state==='confirmed' && order.assignment_confirmation_mode==='automatic'} note={null}/>}
      </section>
    </main>
  </div>;
}
