import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, fmtAddress, fmtCents, STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';
import { OrderStatusControl } from '@/components/orders/OrderStatusControl';
import { AssignTeamControl } from '@/components/orders/AssignTeamControl';
import { PhotoManager } from '@/components/photos/PhotoManager';
import { DeliveryControl } from '@/components/orders/DeliveryControl';

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
      ai_jobs(id, job_type, status, provider, model, cost_cents, duration_ms, created_at, completed_at, error_message)
    `)
    .eq('id', params.id)
    .single();

  if (error || !data) notFound();
  const order = data as any;

  const { data: team } = await supabase
    .from('team_members')
    .select('id, full_name, role')
    .eq('is_active', true);
  const photographers = ((team ?? []) as any[]).filter((t) => t.role === 'photographer' || t.role === 'admin');
  const editors = ((team ?? []) as any[]).filter((t) => t.role === 'editor' || t.role === 'admin');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/orders" className="text-sm text-slate-500 hover:underline">← Orders</Link>
          <h1 className="mt-1 text-2xl font-semibold text-ocean-950">Order #{order.order_number}</h1>
          <p className="text-sm text-slate-600">{order.listings && fmtAddress(order.listings)}</p>
        </div>
        <span className={`pill ${STATUS_COLOR[order.status]}`}>{STATUS_LABEL[order.status]}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold mb-4">Status</h2>
            <OrderStatusControl orderId={order.id} status={order.status} />
          </section>

          <section className="card p-6">
            <h2 className="font-semibold mb-4">Photos</h2>
            <PhotoManager orderId={order.id} />
          </section>
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

          <section className="card p-6">
            <h2 className="font-semibold mb-4">Delivery</h2>
            <DeliveryControl orderId={order.id} />
          </section>

          {order.client_notes && (
            <section className="card p-6">
              <h2 className="font-semibold mb-2">Client notes</h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{order.client_notes}</p>
            </section>
          )}
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
