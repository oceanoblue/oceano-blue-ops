import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const supabase = createClient();
  const { data: jobs } = await supabase
    .from('jobs')
    .select(
      'id, job_number, title, status, priority, due_date, clients(full_name), projects(name), job_types(name)'
    )
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Jobs</h1>
        <p className="text-sm text-slate-600">The main production unit across every job type.</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">#</th>
              <th className="table-head px-4 py-3">Title</th>
              <th className="table-head px-4 py-3">Type</th>
              <th className="table-head px-4 py-3">Client</th>
              <th className="table-head px-4 py-3">Project</th>
              <th className="table-head px-4 py-3">Status</th>
              <th className="table-head px-4 py-3">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(jobs ?? []).map((j: any) => (
              <tr key={j.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500">#{j.job_number}</td>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/jobs/${j.id}`} className="font-medium text-ocean-800 hover:underline">
                    {j.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{j.job_types?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">{j.clients?.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">{j.projects?.name ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{j.status?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-slate-700">
                  {j.due_date ? new Date(j.due_date).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {(jobs ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
