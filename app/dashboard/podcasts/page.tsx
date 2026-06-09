import Link from 'next/link';
import { Mic } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { NewShowPanel } from '@/components/podcasts/NewShowPanel';
import { EPISODE_STATUS_STYLE } from '@/lib/podcasts/constants';

export const dynamic = 'force-dynamic';

export default async function PodcastsPage() {
  const supabase = createClient();
  const [{ data: shows }, { data: episodes }, { data: clients }] = await Promise.all([
    supabase
      .from('podcast_shows')
      .select('id, name, slug, hosts, default_language, clients(full_name), episodes:podcast_episodes(id)')
      .order('name'),
    supabase
      .from('podcast_episodes')
      .select('id, title, status, episode_number, created_at, podcast_shows(name, slug)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('clients').select('id, full_name').order('full_name'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ocean-950">Podcasts</h1>
          <p className="text-sm text-slate-600">
            Shows per client + episodes flowing through the Make pipeline. Production OS is the source of truth.
          </p>
        </div>
        <NewShowPanel clients={(clients ?? []) as any} />
      </div>

      {/* Shows */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Shows</h2>
        {(shows ?? []).length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">
            No shows yet. Create one per client — the slug links it to the Make pipeline.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(shows ?? []).map((s: any) => (
              <Link
                key={s.id}
                href={`/dashboard/podcasts/shows/${s.id}`}
                className="card flex items-start gap-3 p-4 hover:border-ocean-300 hover:shadow-sm"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-ocean-50 text-ocean-700">
                  <Mic className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.clients?.full_name ?? 'Internal'} · {(s.episodes ?? []).length} episode{(s.episodes ?? []).length === 1 ? '' : 's'}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-slate-400">{s.slug}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent episodes */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Recent episodes</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="table-head px-4 py-3">Episode</th>
                <th className="table-head px-4 py-3">Show</th>
                <th className="table-head px-4 py-3">Status</th>
                <th className="table-head px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(episodes ?? []).map((e: any) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/podcasts/${e.id}`} className="font-medium text-ocean-800 hover:underline">
                      {e.episode_number ? `#${e.episode_number} · ` : ''}{e.title ?? 'Untitled episode'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{e.podcast_shows?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${EPISODE_STATUS_STYLE[e.status] ?? 'bg-slate-100 text-slate-600'} capitalize`}>
                      {e.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(e.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {(episodes ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    No episodes yet. They appear here once the Make pipeline runs its intake callback.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
