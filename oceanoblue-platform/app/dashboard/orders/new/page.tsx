'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface ClientOpt { id: string; full_name: string; email: string }
interface ListingOpt { id: string; address_line1: string; city: string; state: string; zip: string }

export default function NewOrderPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [clientId, setClientId] = useState('');
  const [listingId, setListingId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [package_, setPackage] = useState('Essential');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('clients').select('id, full_name, email').then(({ data }) => setClients(data ?? []));
  }, []);

  useEffect(() => {
    if (!clientId) { setListings([]); return; }
    const supabase = createClient();
    supabase
      .from('listings')
      .select('id, address_line1, city, state, zip')
      .eq('client_id', clientId)
      .then(({ data }) => setListings(data ?? []));
  }, [clientId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('orders')
      .insert({
        client_id: clientId,
        listing_id: listingId,
        scheduled_at: scheduledAt || null,
        package_name: package_,
        client_notes: notes,
        status: scheduledAt ? 'scheduled' : 'booked',
      })
      .select('id')
      .single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push(`/dashboard/orders/${data.id}`);
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-ocean-950">New order</h1>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div>
          <label className="label">Client</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">— Choose —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>)}
          </select>
        </div>
        <div>
          <label className="label">Listing</label>
          <select className="input" value={listingId} onChange={(e) => setListingId(e.target.value)} required disabled={!clientId}>
            <option value="">— Choose —</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>{l.address_line1}, {l.city} {l.state} {l.zip}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Scheduled date / time</label>
          <input type="datetime-local" className="input" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>
        <div>
          <label className="label">Package</label>
          <select className="input" value={package_} onChange={(e) => setPackage(e.target.value)}>
            <option>Essential</option>
            <option>Premium</option>
            <option>Premium + Drone</option>
            <option>Twilight + Drone</option>
            <option>Custom</option>
          </select>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {err && <p className="text-sm text-rose-700">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !clientId || !listingId}>
          Create order
        </button>
      </form>
    </div>
  );
}
