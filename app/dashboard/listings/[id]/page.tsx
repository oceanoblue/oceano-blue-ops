import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Home, User, Calendar, Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtAddress, fmtCents, fmtDateTime, STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';
import { NewOrderButton } from '@/components/listings/NewOrderButton';
import { isDeliverable } from '@/lib/photos/deliverable';

export const dynamic = 'force-dynamic';

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: listing, error } = await supabase
    .from('listings')
    .select(`
      *,
      clients(id, full_name, email, phone, brokerage)
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (error || !listing) notFound();
  const l = listing as any;

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, scheduled_at, total_cents, photographer_id, team_members:photographer_id(full_name)')
    .eq('listing_id', params.id)
    .order('created_at', { ascending: false });

  // Pull processed/delivered photos across all orders for this listing
  const orderIds = (orders ?? []).map((o: any) => o.id);
  let photos: any[] = [];
  if (orderIds.length) {
    const { data } = await supabase
      .from('photos')
      .select('id, filename, bucket, storage_path, width, height, is_selected, kind, is_hdr, ai_provider')
      .in('order_id', orderIds)
      .in('kind', ['processed', 'delivered'])
      .eq('is_selected', true)
      .order('sort_order', { ascending: true })
      .limit(40);
    photos = (data ?? []).filter((p: any) => isDeliverable(p));
  }

  // Sign photo URLs server-side
  const signed = await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage.from(p.bucket).createSignedUrl(p.storage_path, 3600);
      return { id: p.id, filename: p.filename, url: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/listings" className="text-sm text-slate-500 hover:underline">
          ← Listings
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-ocean-100 text-ocean-700 grid place-items-center shrink-0">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-ocean-950">{fmtAddress(l)}</h1>
              <p className="text-sm text-slate-600 capitalize">{l.status?.replace('_', ' ')}</p>
            </div>
          </div>
          <NewOrderButton listingId={l.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold mb-4 inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500" /> Property
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Row label="Address">{fmtAddress(l)}</Row>
              <Row label="Property type">{l.property_type ?? '—'}</Row>
              <Row label="Beds">{l.bedrooms ?? '—'}</Row>
              <Row label="Baths">{l.bathrooms ?? '—'}</Row>
              <Row label="Square feet">{l.sqft?.toLocaleString() ?? '—'}</Row>
              <Row label="MLS #">{l.mls_id ?? '—'}</Row>
              <Row label="List price">{l.list_price ? `$${Number(l.list_price).toLocaleString()}` : '—'}</Row>
              <Row label="Access">{l.access_method ?? '—'}</Row>
            </dl>
            {l.highlights && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-xs uppercase tracking-wide text-slate-500">Highlights</div>
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{l.highlights}</p>
              </div>
            )}
          </section>

          <section className="card p-6">
            <h2 className="font-semibold mb-4 inline-flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500" /> Orders ({orders?.length ?? 0})
            </h2>
            {(orders ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No shoots booked for this listing yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 -mx-2">
                {(orders ?? []).map((o: any) => (
                  <li key={o.id} className="px-2 py-3 flex items-center justify-between">
                    <Link
                      href={`/dashboard/orders/${o.id}`}
                      className="flex-1 min-w-0 hover:text-ocean-700"
                    >
                      <div className="font-medium">Order #{o.order_number}</div>
                      <div className="text-xs text-slate-500">
                        {fmtDateTime(o.scheduled_at)} ·{' '}
                        {o.team_members?.full_name ? `📷 ${o.team_members.full_name}` : 'Unassigned'}
                        {o.total_cents > 0 && ` · ${fmtCents(o.total_cents)}`}
                      </div>
                    </Link>
                    <span className={`pill ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {signed.length > 0 && (
            <section className="card p-6">
              <h2 className="font-semibold mb-4 inline-flex items-center gap-2">
                <Camera className="h-4 w-4 text-slate-500" /> Delivered photos
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {signed.map((p) => (
                  <div key={p.id} className="aspect-[3/2] overflow-hidden rounded-md ring-1 ring-slate-200">
                    {p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt={p.filename} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-full w-full bg-slate-100 grid place-items-center text-xs text-slate-400">
                        loading…
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {l.clients && (
            <section className="card p-6">
              <h2 className="font-semibold mb-3 inline-flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" /> Client
              </h2>
              <dl className="text-sm space-y-2">
                <Row label="Name">{l.clients.full_name}</Row>
                <Row label="Email">{l.clients.email}</Row>
                <Row label="Phone">{l.clients.phone ?? '—'}</Row>
                <Row label="Brokerage">{l.clients.brokerage ?? '—'}</Row>
              </dl>
            </section>
          )}
        </aside>
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
