import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ShowForm } from '@/components/podcasts/ShowForm';
import { NewEpisodeForm } from '@/components/podcasts/NewEpisodeForm';
import { PublishingSetup } from '@/components/podcasts/PublishingSetup';
import { EPISODE_STATUS_STYLE } from '@/lib/podcasts/constants';

export const dynamic = 'force-dynamic';

export default async function ShowDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: show }, { data: clients }] = await Promise.all([
    supabase
      .from('podcast_shows')
      .select('id, name, slug, client_id, hosts, description, default_language, tagline, mood, tone, brand_color, logo_url, publishing_platforms, transistor_show_id, make_youtube_connection_id, routes_provisioned_at, clients(full_name)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase.from('clients').select('id, full_name').order('full_name'),
  ]);
  if (!show) notFound();
  const s = show as any;

  const { data: episodes } = await supabase
    .from('podcast_episodes')
    .select('id, title, status, episode_number, created_at')
    .eq('show_id', s.id)
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/podcasts" className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to podcasts
        </Link>
        <div className="mt-1 flex items-center gap-3">
          {s.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo_url} alt={`${s.name} logo`} className="h-11 w-11 rounded object-contain ring-1 ring-slate-200" />
          ) : (
            <div
              className="grid h-11 w-11 place-items-center rounded text-sm font-bold text-white"
              style={{ backgroundColor: s.brand_color || '#0f766e' }}
            >
              {s.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-ocean-950">{s.name}</h1>
            <p className="text-sm text-slate-600">
              {s.clients?.full_name ?? 'Internal'} · slug{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-xs">{s.slug}</code>
              {s.tagline ? ` · ${s.tagline}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-900">Show settings</h2>
          <ShowForm
            clients={(clients ?? []) as any}
            initial={{
              id: s.id,
              name: s.name,
              slug: s.slug,
              client_id: s.client_id,
              hosts: s.hosts ?? '',
              description: s.description ?? '',
              default_language: s.default_language ?? 'en',
              tagline: s.tagline ?? '',
              mood: s.mood ?? '',
              tone: s.tone ?? '',
              brand_color: s.brand_color ?? '',
              logo_url: s.logo_url ?? null,
              publishing_platforms: (s.publishing_platforms ?? ['youtube']) as string[],
              transistor_show_id: s.transistor_show_id ?? '',
            }}
          />
          <p className="mt-3 text-xs text-slate-400">
            The Make scenario routes files to this show via <code className="font-mono">show_slug</code> — change the slug
            only if you also update the scenario/folder naming.
          </p>
        </section>

        <div className="space-y-4 lg:col-span-3">
          <PublishingSetup
            showId={s.id}
            provisioned={Boolean(s.routes_provisioned_at)}
            currentConnectionId={s.make_youtube_connection_id ?? null}
          />

          <section className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Episodes</h2>
          <div className="mb-4">
            <NewEpisodeForm showId={s.id} />
          </div>
          {(episodes ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">
              No episodes yet — they arrive automatically when the pipeline ingests a file for this show, or plan one above.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(episodes ?? []).map((e: any) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/dashboard/podcasts/${e.id}`} className="min-w-0 truncate font-medium text-ocean-800 hover:underline">
                    {e.episode_number ? `#${e.episode_number} · ` : ''}{e.title ?? 'Untitled episode'}
                  </Link>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`pill ${EPISODE_STATUS_STYLE[e.status] ?? 'bg-slate-100 text-slate-600'} capitalize`}>
                      {e.status?.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(e.created_at).toLocaleDateString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          </section>
        </div>
      </div>
    </div>
  );
}
