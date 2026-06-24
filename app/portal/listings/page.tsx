import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Home } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtAddress, fmtRelative } from '@/lib/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PortalHero } from '@/components/portal/PortalHero';

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
      <PortalHero
        title="Your listings"
        subtitle="View galleries, download finished photos, and book your next shoot."
      >
        <Link
          href="/portal/reels"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
        >
          Reels
        </Link>
        <Link
          href="/book"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink-900 shadow-soft transition hover:-translate-y-px hover:shadow-lift"
        >
          Book another shoot
        </Link>
        <form action="/api/portal/signout" method="POST">
          <button className="text-sm text-ink-300 transition hover:text-white">Sign out</button>
        </form>
      </PortalHero>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {(listings ?? []).length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Home}
              title="No listings yet"
              description="Once your first shoot is booked, your galleries will appear here."
              action={
                <Link href="/book" className="btn-primary">
                  Book a shoot
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(listings ?? []).map((l: any) => {
              const o = latestOrder.get(l.id);
              return (
                <li key={l.id}>
                  <Link
                    href={`/portal/listings/${l.id}`}
                    className="card-interactive group block overflow-hidden"
                  >
                    <div className="h-1.5 w-full bg-gradient-to-r from-ocean-400 to-ocean-700" />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ocean-100 text-ocean-700 transition group-hover:bg-ocean-600 group-hover:text-white">
                            <Home className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-display text-base font-semibold text-ocean-950">
                              {l.address_line1}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {[l.city, l.state, l.zip].filter(Boolean).join(', ')}
                            </div>
                          </div>
                        </div>
                        {o && <StatusBadge status={o.status} className="shrink-0" />}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <span>
                          {l.bedrooms ?? '—'} bd · {l.bathrooms ?? '—'} ba ·{' '}
                          {l.sqft ? l.sqft.toLocaleString() : '—'} sqft
                        </span>
                        <span>Updated {fmtRelative(l.updated_at)}</span>
                      </div>
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
