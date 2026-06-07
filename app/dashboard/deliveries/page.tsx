import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DeliveriesPage() {
  const supabase = createClient();
  const { data: deliveries } = await supabase
    .from('delivery_versions')
    .select('id, title, delivery_type, status, version_number, external_url, created_at, jobs(title)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Deliveries</h1>
        <p className="text-sm text-slate-600">Draft and final deliverables across all jobs.</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Title</th>
              <th className="table-head px-4 py-3">Job</th>
              <th className="table-head px-4 py-3">Type</th>
              <th className="table-head px-4 py-3">Version</th>
              <th className="table-head px-4 py-3">Status</th>
              <th className="table-head px-4 py-3">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(deliveries ?? []).map((d: any) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{d.title ?? 'Delivery'}</td>
                <td className="px-4 py-3 text-slate-700">{d.jobs?.title ?? '—'}</td>
                <td className="px-4 py-3 capitalize text-slate-700">{d.delivery_type?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-slate-500">v{d.version_number}</td>
                <td className="px-4 py-3 capitalize">{d.status?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">
                  {d.external_url ? (
                    <a href={d.external_url} className="text-ocean-700 hover:underline" target="_blank" rel="noreferrer">
                      Open →
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {(deliveries ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No deliveries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
