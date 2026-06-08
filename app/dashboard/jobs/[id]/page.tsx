import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TABS = [
  'Overview',
  'Brief',
  'Assets',
  'Workflow',
  'AI Plan',
  'Automations',
  'Review',
  'QC',
  'Delivery',
  'Activity',
] as const;

function tabKey(label: string) {
  return label.toLowerCase().replace(/\s+/g, '-');
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-6 text-sm text-slate-500">{children}</div>;
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const supabase = createClient();
  const activeTab = searchParams.tab ?? 'overview';

  const { data: job } = await supabase
    .from('jobs')
    .select(
      'id, job_number, title, description, status, priority, language, due_date, scheduled_at, next_action, created_at, clients(full_name), projects(id, name), job_types(key, name, category)'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!job) notFound();
  const j = job as any;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500">
            Job #{j.job_number} · {j.job_types?.name ?? 'No type'}
          </div>
          <h1 className="text-2xl font-semibold text-ocean-950">{j.title}</h1>
          <p className="text-sm text-slate-600">
            {j.clients?.full_name ?? 'Unassigned'} · {j.projects?.name ?? 'No project'}
          </p>
        </div>
        <span className="pill bg-ocean-50 text-ocean-800 capitalize">
          {j.status?.replace(/_/g, ' ')}
        </span>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((label) => {
          const key = tabKey(label);
          const active = activeTab === key;
          return (
            <Link
              key={key}
              href={`/dashboard/jobs/${j.id}?tab=${key}`}
              className={
                'rounded-t-md px-3 py-2 text-sm font-medium ' +
                (active
                  ? 'border-b-2 border-ocean-700 text-ocean-900'
                  : 'text-slate-500 hover:text-slate-800')
              }
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <TabContent tab={activeTab} jobId={j.id} job={j} />
    </div>
  );
}

async function TabContent({ tab, jobId, job }: { tab: string; jobId: string; job: any }) {
  const supabase = createClient();

  if (tab === 'overview') {
    const { data: events } = await supabase
      .from('production_events')
      .select('id, event_type, summary, actor_type, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(10);

    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Status" value={job.status?.replace(/_/g, ' ')} />
            <Detail label="Priority" value={job.priority} />
            <Detail label="Language" value={job.language} />
            <Detail
              label="Due"
              value={job.due_date ? new Date(job.due_date).toLocaleDateString() : '—'}
            />
            <Detail
              label="Scheduled"
              value={job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : '—'}
            />
            <Detail label="Next action" value={job.next_action ?? '—'} />
          </dl>
          {job.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{job.description}</p>
          )}
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Recent activity</h2>
          <ul className="space-y-3 text-sm">
            {(events ?? []).length === 0 && <li className="text-slate-400">No activity yet.</li>}
            {(events ?? []).map((e: any) => (
              <li key={e.id}>
                <div className="font-medium text-slate-800">{e.summary ?? e.event_type}</div>
                <div className="text-xs text-slate-400">
                  {e.actor_type} · {new Date(e.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (tab === 'assets') {
    const { data: assets } = await supabase
      .from('assets')
      .select('id, filename, media_type, asset_type, status')
      .eq('job_id', jobId)
      .limit(100);
    const isRePhoto = job.job_types?.key === 'real_estate_photo';
    const rescueLink = isRePhoto ? (
      <Link
        href={`/dashboard/jobs/${jobId}/photo-rescue`}
        className="btn-secondary mb-3 inline-flex w-fit"
      >
        Open Photo Rescue (ingest + bracket review + QC) →
      </Link>
    ) : null;
    if (!assets || assets.length === 0)
      return (
        <div className="flex flex-col">
          {rescueLink}
          <Empty>No assets registered for this job yet.</Empty>
        </div>
      );
    return (
      <div className="flex flex-col">
        {rescueLink}
        <ul className="card divide-y divide-slate-100">
        {assets.map((a: any) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium text-slate-800">{a.filename ?? a.id}</span>
            <span className="text-slate-500">
              {a.media_type} · {a.asset_type} · {a.status}
            </span>
          </li>
        ))}
        </ul>
      </div>
    );
  }

  if (tab === 'workflow') {
    const { data: runs } = await supabase
      .from('workflow_runs')
      .select('id, name, status, created_at')
      .eq('job_id', jobId)
      .limit(50);
    if (!runs || runs.length === 0) return <Empty>No workflow runs yet.</Empty>;
    return (
      <ul className="card divide-y divide-slate-100">
        {runs.map((r: any) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium text-slate-800">{r.name ?? 'Workflow run'}</span>
            <span className="capitalize text-slate-500">{r.status?.replace(/_/g, ' ')}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (tab === 'activity') {
    const { data: events } = await supabase
      .from('production_events')
      .select('id, event_type, summary, actor_type, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!events || events.length === 0) return <Empty>No activity recorded yet.</Empty>;
    return (
      <ul className="card divide-y divide-slate-100">
        {events.map((e: any) => (
          <li key={e.id} className="px-4 py-3 text-sm">
            <div className="font-medium text-slate-800">{e.summary ?? e.event_type}</div>
            <div className="text-xs text-slate-400">
              {e.actor_type} · {new Date(e.created_at).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  // Brief, AI Plan, Automations, Review, QC, Delivery — Phase 1 placeholders.
  return (
    <Empty>
      This tab is part of the Phase 1 shell. Data wiring for <strong>{tab}</strong> arrives in a
      later phase.
    </Empty>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 capitalize text-slate-800">{value ?? '—'}</dd>
    </div>
  );
}
