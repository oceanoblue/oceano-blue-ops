import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtAddress, fmtRelative, STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function ClientListingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal');

  // Listings — RLS filters by current_client_id() automatically.
  const { data: listings } = await supabase
    .from('listings')
    .select('id, address_line1, city, state, zip, bedrooms, bathrooms, sqft, status, updated_at')
    .order('updated_at', { ascending: false });

  // Most recent order per listing for status pill + delivery info.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, listing_id, status, scheduled_at, delivered_at')
    .order('updated_at', { ascending: false });

  const latestOrder = new Map<string, any>();
  (orders ?? []).forEach((o: any) => {
    if (!latestOrder.has(o.listing_id)) latestOrder.set(o.listing_id, o);
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-ocean-700">Oceano Blue</div>
            <h1 className="text-xl font-semibold text-ocean-950">Your listings</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/book" className="btn-secondary text-sm">Book another shoot</Link>
            <form action="/api/portal/signout" method="POST">
              <button className="btn-ghost text-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {(listings ?? []).length === 0 ? (
          <div className="card p-12 text-center">
            <h2 className="text-lg font-semibold">No listings yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Once your first shoot is booked it'll appear here.
            </p>
            <Link href="/book" className="btn-primary mt-6 inline-flex">Book a shoot</Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(listings ?? []).map((l: any) => {
              const o = latestOrder.get(l.id);
              return (
                <li key={l.id} className="card overflow-hidden">
                  <Link href={`/portal/listings/${l.id}`} className="block p-5 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-ocean-900 truncate">{fmtAddress(l)}</div>
                      {o && (
                        <span className={`pill ${STATUS_COLOR[o.status]} shrink-0`}>
                          {STATUS_LABEL[o.status]}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {l.bedrooms ?? '—'} bd · {l.bathrooms ?? '—'} ba · {l.sqft ?? '—'} sqft
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      Updated {fmtRelative(l.updated_at)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
