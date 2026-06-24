import Link from 'next/link';
import { Images } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
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
      <PageHeader
        eyebrow="Production"
        title="Real Estate Photo Production"
        subtitle="Organize bracket sets, process internal HDR outputs, review results, and run delivery QC."
        icon={Images}
      >
        <NewReJobButton />
      </PageHeader>

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
                  No real estate photo jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
