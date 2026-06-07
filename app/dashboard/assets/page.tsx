import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  const supabase = createClient();
  const { data: assets } = await supabase
    .from('assets')
    .select('id, filename, media_type, asset_type, status, jobs(title)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Assets</h1>
        <p className="text-sm text-slate-600">
          Universal media records — files stay on local/NAS/cloud; this is the index.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">File</th>
              <th className="table-head px-4 py-3">Job</th>
              <th className="table-head px-4 py-3">Media</th>
              <th className="table-head px-4 py-3">Type</th>
              <th className="table-head px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(assets ?? []).map((a: any) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{a.filename ?? a.id}</td>
                <td className="px-4 py-3 text-slate-700">{a.jobs?.title ?? '—'}</td>
                <td className="px-4 py-3 capitalize text-slate-700">{a.media_type}</td>
                <td className="px-4 py-3 capitalize text-slate-700">{a.asset_type?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 capitalize">{a.status?.replace(/_/g, ' ')}</td>
              </tr>
            ))}
            {(assets ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No assets registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
