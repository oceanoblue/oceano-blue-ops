import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtAddress } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function ListingsPage() {
  const supabase = createClient();
  const { data: listings } = await supabase
    .from('listings')
    .select('id, address_line1, city, state, zip, bedrooms, bathrooms, sqft, status, clients(full_name, brokerage)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ocean-950">Listings</h1>
          <p className="text-sm text-slate-600">Every property the team has photographed or scheduled.</p>
        </div>
        <Link href="/dashboard/listings/new" className="btn-primary">
          New listing
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Address</th>
              <th className="table-head px-4 py-3">Client</th>
              <th className="table-head px-4 py-3">Beds / Baths</th>
              <th className="table-head px-4 py-3">Sq ft</th>
              <th className="table-head px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(listings ?? []).map((l: any) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/listings/${l.id}`} className="text-ocean-800 hover:underline">
                    {fmtAddress(l)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <div>{l.clients?.full_name ?? '—'}</div>
                  <div className="text-xs text-slate-500">{l.clients?.brokerage ?? ''}</div>
                </td>
                <td className="px-4 py-3">{l.bedrooms ?? '—'} / {l.bathrooms ?? '—'}</td>
                <td className="px-4 py-3">{l.sqft ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{l.status}</td>
              </tr>
            ))}
            {(listings ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No listings yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
