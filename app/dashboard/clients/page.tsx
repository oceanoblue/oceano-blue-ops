import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const supabase = createClient();
  const { data: clients } = await supabase
    .from('clients')
    .select('id, full_name, email, brokerage, phone, created_at')
    .order('full_name', { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Clients</h1>
        <p className="text-sm text-slate-600">Real estate agents who've booked with you.</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Name</th>
              <th className="table-head px-4 py-3">Brokerage</th>
              <th className="table-head px-4 py-3">Email</th>
              <th className="table-head px-4 py-3">Phone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(clients ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{c.full_name}</td>
                <td className="px-4 py-3 text-slate-700">{c.brokerage ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">{c.email}</td>
                <td className="px-4 py-3 text-slate-700">{c.phone ?? '—'}</td>
              </tr>
            ))}
            {(clients ?? []).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No clients yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
