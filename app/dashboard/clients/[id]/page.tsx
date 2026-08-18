import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Home } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ClientEditForm } from '@/components/clients/ClientEditForm';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: client } = await supabase
    .from('clients')
    .select('id, full_name, email, phone, brokerage, notes')
    .eq('id', params.id)
    .maybeSingle();
  if (!client) notFound();

  const { data: listings } = await supabase
    .from('listings')
    .select('id, address_line1, city, state, zip')
    .eq('client_id', params.id)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to clients
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-ocean-950">{client.full_name}</h1>
        <p className="text-sm text-slate-600">Edit contact details — changes save immediately.</p>
      </div>

      <ClientEditForm client={client as any} />

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ocean-900">
          <Home className="h-4 w-4 text-slate-500" />
          Properties ({listings?.length ?? 0})
        </div>
        {listings && listings.length > 0 ? (
          <ul className="card divide-y divide-slate-100">
            {listings.map((l: any) => (
              <li key={l.id}>
                <Link
                  href={`/dashboard/listings/${l.id}`}
                  className="block px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {l.address_line1}, {l.city} {l.state} {l.zip}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No properties yet.</p>
        )}
      </div>
    </div>
  );
}
