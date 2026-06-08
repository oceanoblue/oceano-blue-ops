import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  ingested: 'bg-slate-100 text-slate-600',
  transcribed: 'bg-sky-100 text-sky-700',
  needs_review: 'bg-amber-100 text-amber-800',
  ready_to_publish: 'bg-violet-100 text-violet-700',
  needs_revision: 'bg-rose-100 text-rose-700',
  published: 'bg-emerald-100 text-emerald-700',
};

export default async function PodcastsPage() {
  const supabase = createClient();
  const { data: episodes } = await supabase
    .from('podcast_episodes')
    .select('id, title, status, episode_number, created_at, podcast_shows(name, slug)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Podcasts</h1>
        <p className="text-sm text-slate-600">
          Episodes flowing through the Make.com pipeline. Production OS is the source of truth.
        </p>
      </div>

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
                    {e.title ?? 'Untitled episode'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{e.podcast_shows?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`pill ${STATUS_STYLE[e.status] ?? 'bg-slate-100 text-slate-600'} capitalize`}>
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
  );
}
