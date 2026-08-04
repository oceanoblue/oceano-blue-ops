import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, Plus, MapPin, DollarSign } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtRelative } from '@/lib/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PortalHero } from '@/components/portal/PortalHero';

export const dynamic = 'force-dynamic';

export default async function FieldShootsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/field');

  // Own contractor row (RLS: contractor read own row). Absent → this signed-in
  // email isn't a registered contractor.
  const { data: me } = await supabase
    .from('contractors')
    .select('id, full_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!me) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PortalHero eyebrow="Photographers" title="Not set up yet">
          <form action="/api/field/signout" method="POST">
            <button className="text-sm text-ink-300 transition hover:text-white">Sign out</button>
          </form>
        </PortalHero>
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div className="card p-6 text-sm text-slate-600">
            You&rsquo;re signed in, but this email isn&rsquo;t registered as a photographer yet.
            Ask the Oceano Blue office to add you, then sign in again with the same email.
          </div>
        </main>
      </div>
    );
  }

  // Own shoots — RLS filters to contractor_id = current_contractor_id().
  const { data: shoots } = await supabase
    .from('orders')
    .select('id, status, source, scheduled_at, created_at, dropbox_intake_url, listings(address_line1, city, state, sqft)')
    .order('created_at', { ascending: false });

  const firstName = me.full_name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero
        eyebrow="Photographers"
        title={`Hi, ${firstName}`}
        subtitle="Your shoots, in one place. Log a new property, upload the RAWs, track its status."
      >
        <Link
          href="/field/shoots/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-ink-900 shadow-soft transition hover:-translate-y-px hover:shadow-lift"
        >
          <Plus className="h-4 w-4" /> Log a shoot
        </Link>
        <Link
          href="/field/pay"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20"
        >
          <DollarSign className="h-4 w-4" /> Get paid
        </Link>
        <form action="/api/field/signout" method="POST">
          <button className="text-sm text-ink-300 transition hover:text-white">Sign out</button>
        </form>
      </PortalHero>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {(shoots ?? []).length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Camera}
              title="No shoots yet"
              description="Log your first property to get an upload folder and start tracking it."
              action={
                <Link href="/field/shoots/new" className="btn-primary">
                  <Plus className="h-4 w-4" /> Log a shoot
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {(shoots ?? []).map((s: any) => {
              const l = s.listings;
              return (
                <li key={s.id}>
                  <Link
                    href={`/field/shoots/${s.id}`}
                    className="card-interactive group flex items-center gap-4 p-4"
                  >
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-ocean-100 text-ocean-700 transition group-hover:bg-ocean-600 group-hover:text-white">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink-900">
                        {l?.address_line1 ?? 'Address pending'}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[l?.city, l?.state].filter(Boolean).join(', ')}
                        {l?.sqft ? ` · ${l.sqft.toLocaleString()} sqft` : ''}
                        {' · logged '}
                        {fmtRelative(s.created_at)}
                      </div>
                    </div>
                    <StatusBadge status={s.status} className="shrink-0" />
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
