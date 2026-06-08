import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Statuses that mean a job is still "live" (used for the Overdue bucket).
const CLOSED_STATUSES = ['delivered', 'approved', 'archived', 'cancelled'];

type JobRow = {
  id: string;
  job_number: number;
  title: string;
  status: string;
  due_date: string | null;
  scheduled_at: string | null;
  next_action: string | null;
  updated_at: string;
  clients: { full_name: string | null } | null;
  projects: { name: string | null } | null;
  job_types: { name: string | null } | null;
};

function isToday(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function JobCard({ job }: { job: JobRow }) {
  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      className="block rounded-md border border-slate-200 bg-white p-3 hover:border-ocean-300 hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">
          {job.clients?.full_name ?? 'Unassigned client'}
        </span>
        <span className="pill bg-slate-100 text-slate-600 capitalize">
          {job.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="mt-1 text-sm font-semibold text-ocean-950">{job.title}</div>
      <div className="text-xs text-slate-500">
        {job.projects?.name ?? '—'}
        {job.job_types?.name ? ` · ${job.job_types.name}` : ''}
      </div>
      {job.next_action && (
        <div className="mt-2 text-xs text-ocean-700">→ {job.next_action}</div>
      )}
      {job.due_date && (
        <div className="mt-1 text-xs text-slate-400">
          Due {new Date(job.due_date).toLocaleDateString()}
        </div>
      )}
    </Link>
  );
}

function Section({ title, jobs }: { title: string; jobs: JobRow[] }) {
  return (
    <section className="card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="text-xs font-medium text-slate-400">{jobs.length}</span>
      </header>
      <div className="space-y-2">
        {jobs.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">Nothing here.</p>
        ) : (
          jobs.map((j) => <JobCard key={j.id} job={j} />)
        )}
      </div>
    </section>
  );
}

export default async function CommandCenterPage() {
  const supabase = createClient();

  const { data: jobsData } = await supabase
    .from('jobs')
    .select(
      'id, job_number, title, status, due_date, scheduled_at, next_action, updated_at, clients(full_name), projects(name), job_types(name)'
    )
    .order('updated_at', { ascending: false })
    .limit(300);

  const jobs = (jobsData ?? []) as unknown as JobRow[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byStatus = (statuses: string[]) => jobs.filter((j) => statuses.includes(j.status));

  const sections = [
    { title: 'Today', jobs: jobs.filter((j) => isToday(j.scheduled_at) || isToday(j.due_date)) },
    { title: 'New Ingests', jobs: byStatus(['media_received', 'ingesting']) },
    { title: 'In Progress', jobs: byStatus(['in_progress', 'intake', 'scheduled']) },
    { title: 'Needs AI Review', jobs: byStatus(['waiting_on_ai']) },
    { title: 'Needs Human Review', jobs: byStatus(['needs_review', 'needs_revision']) },
    { title: 'Waiting on Editor', jobs: byStatus(['waiting_on_editor']) },
    { title: 'Ready to Deliver', jobs: byStatus(['ready_to_deliver']) },
    {
      title: 'Overdue',
      jobs: jobs.filter(
        (j) =>
          j.due_date != null &&
          new Date(j.due_date) < today &&
          !CLOSED_STATUSES.includes(j.status)
      ),
    },
  ];

  // Failed automations / tool runs.
  const { data: failedRuns } = await supabase
    .from('tool_runs')
    .select('id, tool_type, provider, status, created_at, job_id')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(20);

  const failed = (failedRuns ?? []) as Array<{
    id: string;
    tool_type: string;
    provider: string | null;
    status: string;
    created_at: string;
  }>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Command Center</h1>
        <p className="text-sm text-slate-600">
          Everything moving through production, in one place.
        </p>
      </div>

      {jobs.length === 0 && failed.length === 0 && (
        <div className="card p-6 text-sm text-slate-600">
          No jobs yet. Create your first job from{' '}
          <Link href="/dashboard/jobs" className="text-ocean-700 hover:underline">
            Jobs
          </Link>{' '}
          to see it flow through the Command Center.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((s) => (
          <Section key={s.title} title={s.title} jobs={s.jobs} />
        ))}

        <section className="card p-4">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Failed Automations</h2>
            <span className="text-xs font-medium text-slate-400">{failed.length}</span>
          </header>
          <div className="space-y-2">
            {failed.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No failures.</p>
            ) : (
              failed.map((r) => (
                <div key={r.id} className="rounded-md border border-rose-200 bg-rose-50 p-3">
                  <div className="text-sm font-medium text-rose-900">
                    {r.provider ?? r.tool_type}
                  </div>
                  <div className="text-xs text-rose-600">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
