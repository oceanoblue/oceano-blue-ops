import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const supabase = createClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, due_date, language, clients(full_name), jobs(count)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Projects</h1>
        <p className="text-sm text-slate-600">Client initiatives that group related jobs.</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Project</th>
              <th className="table-head px-4 py-3">Client</th>
              <th className="table-head px-4 py-3">Jobs</th>
              <th className="table-head px-4 py-3">Status</th>
              <th className="table-head px-4 py-3">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(projects ?? []).map((p: any) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-ocean-800">{p.name}</td>
                <td className="px-4 py-3 text-slate-700">{p.clients?.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">{p.jobs?.[0]?.count ?? 0}</td>
                <td className="px-4 py-3 capitalize">{p.status?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-slate-700">
                  {p.due_date ? new Date(p.due_date).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {(projects ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
