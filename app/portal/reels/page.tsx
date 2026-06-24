import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Film, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtRelative } from '@/lib/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PortalHero } from '@/components/portal/PortalHero';
import { REEL_TYPES, ASPECTS } from '@/lib/reels/types';

export const dynamic = 'force-dynamic';

export default async function ClientReelsPage({
  searchParams,
}: {
  searchParams: { submitted?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal');

  // RLS scopes these to the signed-in client's own orders.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, created_at, reel_briefs(reel_type, aspect, subject_name, length_target_s)')
    .eq('order_kind', 'reel_edit')
    .order('created_at', { ascending: false });

  const reelLabel = (v?: string) => REEL_TYPES.find((t) => t.value === v)?.label ?? '—';
  const aspectLabel = (v?: string) => ASPECTS.find((a) => a.value === v)?.label ?? v ?? '—';

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero
        eyebrow="Reels"
        title="Your reels"
        subtitle="Upload footage, set the brief, and track each edit through to delivery."
        backHref="/portal/listings"
        backLabel="Listings"
      >
        <Link
          href="/portal/reels/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink-900 shadow-soft transition hover:-translate-y-px hover:shadow-lift"
        >
          <Plus className="h-4 w-4" /> Create a reel
        </Link>
      </PortalHero>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {searchParams.submitted && (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            🎬 Reel submitted — our team will start editing and you&apos;ll see it here as it
            progresses.
          </div>
        )}

        {(orders ?? []).length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Film}
              title="No reels yet"
              description="Upload your footage and tell us how to cut it. We'll handle the rest."
              action={
                <Link href="/portal/reels/new" className="btn-primary">
                  Create your first reel
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {(orders ?? []).map((o: any) => {
              const b = Array.isArray(o.reel_briefs) ? o.reel_briefs[0] : o.reel_briefs;
              return (
                <li key={o.id} className="card flex items-center gap-4 p-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-ocean-100 text-ocean-700">
                    <Film className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-semibold text-ocean-950">
                        {reelLabel(b?.reel_type)}
                      </span>
                      <span className="text-xs text-slate-400">#{o.order_number}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {aspectLabel(b?.aspect)}
                      {b?.subject_name ? ` · ${b.subject_name}` : ''}
                      {b?.length_target_s ? ` · ${b.length_target_s}s` : ''} · submitted{' '}
                      {fmtRelative(o.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={o.status} className="shrink-0" />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
