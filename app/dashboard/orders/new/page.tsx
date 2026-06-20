'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, User, Home, Calendar, Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AppointmentPicker } from '@/components/scheduling/AppointmentPicker';

interface ClientOpt { id: string; full_name: string; email: string }
interface ListingOpt { id: string; address_line1: string; city: string; state: string; zip: string }
interface PhotographerOpt { id: string; full_name: string; role: string }

export default function NewOrderPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [photographers, setPhotographers] = useState<PhotographerOpt[]>([]);
  const [clientId, setClientId] = useState('');
  const [listingId, setListingId] = useState('');
  const [appointment, setAppointment] = useState<{
    scheduledAt: string | null;
    photographerId: string | null;
    durationMinutes: number;
    timezone: string;
  }>({
    scheduledAt: null,
    photographerId: null,
    durationMinutes: 60,
    timezone: 'America/New_York',
  });
  const [package_, setPackage] = useState('Essential');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('clients').select('id, full_name, email').order('full_name').then(({ data }) => setClients((data as any) ?? []));
    supabase
      .from('team_members')
      .select('id, full_name, role')
      .in('role', ['admin', 'photographer'])
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setPhotographers((data as any) ?? []));
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
        scheduled_at: appointment.scheduledAt,
        duration_minutes: appointment.durationMinutes,
        timezone: appointment.timezone,
        photographer_id: appointment.photographerId,
        package_name: package_,
        client_notes: notes,
        status: appointment.scheduledAt ? 'scheduled' : 'booked',
      })
      .select('id')
      .single();
    setBusy(false);
    if (error) {
      // Double-book guard (SQLSTATE 23P01) → friendly message.
      const conflict = (error as any).code === '23P01' || /slot_unavailable/i.test(error.message);
      setErr(
        conflict
          ? 'That photographer is already booked around this time — pick another slot or photographer.'
          : error.message
      );
      return;
    }
    router.push(`/dashboard/orders/${(data as any).id}`);
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-ocean-100 text-ocean-700 grid place-items-center">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-ocean-950">New order</h1>
          <p className="text-sm text-slate-600">Manually add a shoot to the pipeline.</p>
        </div>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-6">
        {/* Client + Listing */}
        <Section icon={<User className="h-4 w-4" />} title="Who & where">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Client <span className="text-rose-600">*</span></label>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Choose a client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Listing <span className="text-rose-600">*</span></label>
              <select
                className="input"
                value={listingId}
                onChange={(e) => setListingId(e.target.value)}
                required
                disabled={!clientId}
              >
                <option value="">{clientId ? 'Choose a property' : 'Pick a client first'}</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.address_line1}, {l.city} {l.state} {l.zip}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* Schedule */}
        <Section icon={<Calendar className="h-4 w-4" />} title="Schedule">
          <AppointmentPicker
            value={appointment}
            onChange={setAppointment}
            photographers={photographers.map((p) => ({ id: p.id, full_name: p.full_name }))}
            allowOverride
          />
        </Section>

        {/* Package + Notes */}
        <Section icon={<Home className="h-4 w-4" />} title="Package & notes">
          <div className="space-y-3">
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
              <label className="label">Internal notes</label>
              <textarea
                className="input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Lockbox code, access, special instructions…"
              />
            </div>
          </div>
        </Section>

        {err && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">{err}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => router.push('/dashboard/orders')}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !clientId || !listingId}>
            {busy ? 'Creating…' : 'Create order'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 text-sm font-medium text-ocean-900 mb-3">
        <span className="text-slate-500">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}
