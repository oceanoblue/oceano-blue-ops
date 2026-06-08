import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { NewReJobButton } from '@/components/photos/rescue/NewReJobButton';

export const dynamic = 'force-dynamic';

export default async function PhotoRescueIndex() {
  const supabase = createClient();

  // Real estate photo jobs (by job type key).
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, status, next_action, created_at, clients(full_name), job_types!inner(key, name)')
    .eq('job_types.key', 'real_estate_photo')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ocean-950">Real Estate Photo Rescue</h1>
          <p className="text-sm text-slate-600">
            Ingest a shoot, auto-detect HDR brackets with confidence scores, fix
            uncertain groups, and run delivery QC.
          </p>
        </div>
        <NewReJobButton />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Job</th>
              <th className="table-head px-4 py-3">Client</th>
              <th className="table-head px-4 py-3">Status</th>
              <th className="table-head px-4 py-3">Next action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(jobs ?? []).map((j: any) => (
              <tr key={j.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/jobs/${j.id}/photo-rescue`} className="font-medium text-ocean-800 hover:underline">
                    {j.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{j.clients?.full_name ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{j.status?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-slate-600">{j.next_action ?? '—'}</td>
              </tr>
            ))}
            {(jobs ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  No real estate photo jobs yet. Create one to start a rescue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
