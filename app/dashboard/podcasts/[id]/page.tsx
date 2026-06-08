import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Youtube } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ApprovalPanel } from '@/components/podcasts/ApprovalPanel';

export const dynamic = 'force-dynamic';

export default async function PodcastEpisodePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: ep } = await supabase
    .from('podcast_episodes')
    .select('id, title, status, metadata, job_id, recorded_at, podcast_shows(name, slug)')
    .eq('id', params.id)
    .maybeSingle();
  if (!ep) notFound();
  const e = ep as any;
  const jobId = e.job_id;

  const [{ data: transcript }, { data: deliverables }, { data: links }, { data: approvals }, { data: events }] =
    await Promise.all([
      supabase.from('transcripts').select('id, language, text, metadata').eq('episode_id', e.id).maybeSingle(),
      supabase.from('podcast_deliverables').select('id, deliverable_type, status, external_url, notes').eq('episode_id', e.id),
      jobId
        ? supabase.from('external_links').select('link_type, url, label').eq('job_id', jobId)
        : Promise.resolve({ data: [] as any[] }),
      jobId
        ? supabase.from('approvals').select('id, status').eq('job_id', jobId).eq('status', 'pending').limit(1)
        : Promise.resolve({ data: [] as any[] }),
      jobId
        ? supabase
            .from('production_events')
            .select('id, event_type, summary, actor_type, created_at')
            .eq('job_id', jobId)
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] as any[] }),
    ]);

  const copy = (e.metadata?.copy ?? {}) as any;
  const youtube = (links ?? []).find((l: any) => l.link_type === 'youtube_video');
  const pendingApproval = (approvals ?? []).length > 0;
  const transcriptText: string = (transcript as any)?.text ?? '';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/podcasts" className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to podcasts
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-ocean-950">{e.title ?? 'Untitled episode'}</h1>
          <span className="pill bg-ocean-50 text-ocean-800 capitalize">{e.status?.replace(/_/g, ' ')}</span>
        </div>
        <p className="text-sm text-slate-600">
          {e.podcast_shows?.name ?? '—'}
          {e.metadata?.season_episode ? ` · ${e.metadata.season_episode}` : ''}
        </p>
      </div>

      {pendingApproval && <ApprovalPanel episodeId={e.id} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Generated copy */}
          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Generated copy</h2>
            {copy.title || copy.podcast_description ? (
              <dl className="space-y-3 text-sm">
                <Field label="Title" value={copy.title} />
                <Field label="YouTube description" value={copy.youtube_description} pre />
                <Field label="Podcast description" value={copy.podcast_description} pre />
                <Field label="Social post" value={copy.social_post} pre />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Tags</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {(copy.tags ?? []).map((t: string) => (
                      <span key={t} className="pill bg-slate-100 text-slate-600">{t}</span>
                    ))}
                    {(copy.tags ?? []).length === 0 && <span className="text-slate-400">—</span>}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">No AI copy yet — generated after transcription.</p>
            )}
          </section>

          {/* Transcript */}
          <section className="card p-5">
            <h2 className="mb-2 font-semibold text-slate-900">Transcript</h2>
            {transcriptText ? (
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-slate-600">
                {transcriptText.slice(0, 4000)}
                {transcriptText.length > 4000 ? '…' : ''}
              </p>
            ) : (
              <p className="text-sm text-slate-500">No transcript yet.</p>
            )}
          </section>
        </div>

        <div className="space-y-4">
          {/* Delivery / links */}
          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Delivery</h2>
            {youtube?.url ? (
              <a href={youtube.url} target="_blank" rel="noreferrer" className="mb-3 inline-flex items-center gap-2 text-sm text-ocean-700 hover:underline">
                <Youtube className="h-4 w-4" /> {youtube.label ?? 'YouTube'}
              </a>
            ) : (
              <p className="mb-3 text-sm text-slate-500">Not uploaded yet.</p>
            )}
            <ul className="space-y-1 text-sm">
              {(deliverables ?? []).map((d: any) => (
                <li key={d.id} className="flex items-center justify-between">
                  <span className="capitalize text-slate-700">{d.deliverable_type?.replace(/_/g, ' ')}</span>
                  <span className="pill bg-slate-100 text-slate-600 capitalize">{d.status?.replace(/_/g, ' ')}</span>
                </li>
              ))}
              {(deliverables ?? []).length === 0 && <li className="text-slate-400">No deliverables yet.</li>}
            </ul>
          </section>

          {/* Activity */}
          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Activity</h2>
            <ul className="space-y-2 text-sm">
              {(events ?? []).length === 0 && <li className="text-slate-400">No activity yet.</li>}
              {(events ?? []).map((ev: any) => (
                <li key={ev.id}>
                  <div className="text-slate-800">{ev.summary ?? ev.event_type}</div>
                  <div className="text-xs text-slate-400">
                    {ev.actor_type} · {new Date(ev.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, pre }: { label: string; value?: string | null; pre?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-slate-800 ${pre ? 'whitespace-pre-wrap' : ''}`}>{value || '—'}</dd>
    </div>
  );
}
