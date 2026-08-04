import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortalHero } from '@/components/portal/PortalHero';
import { PayRequestForm, type EligibleShoot, type PayRequestRow } from '@/components/field/PayRequestForm';

export const dynamic = 'force-dynamic';

// Mirrors the office roster: a shoot is payable once the RAWs are in.
const PAYABLE = ['uploaded', 'processing', 'editing', 'ready', 'delivered'] as const;

export default async function FieldPayPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/field');

  const { data: me } = await supabase
    .from('contractors')
    .select('id, full_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!me) redirect('/field/shoots');

  // All RLS-scoped to the signed-in contractor.
  const [{ data: eligible }, { count: awaitingUpload }, { data: requests }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, created_at, scheduled_at, pay_amount_cents, listings(address_line1, city, state)')
      .eq('pay_status', 'unpaid')
      .is('pay_request_id', null)
      .in('status', PAYABLE)
      .order('created_at', { ascending: true }),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('pay_status', 'unpaid')
      .is('pay_request_id', null)
      .in('status', ['booked', 'scheduled', 'shooting']),
    supabase
      .from('pay_requests')
      .select('id, period_start, period_end, status, shoot_count, total_cents, notes, paid_note, paid_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const shoots: EligibleShoot[] = (eligible ?? []).map((o: any) => ({
    id: o.id,
    address: o.listings?.address_line1 ?? 'Address pending',
    cityState: [o.listings?.city, o.listings?.state].filter(Boolean).join(', '),
    shotAt: o.scheduled_at ?? o.created_at,
    status: o.status,
    payCents: o.pay_amount_cents ?? 0,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero
        eyebrow="Weekly pay"
        title="Get paid"
        subtitle="Review the shoots you've completed, then submit your weekly pay request. The office settles it from here."
        backHref="/field/shoots"
        backLabel="My shoots"
      />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PayRequestForm
          shoots={shoots}
          awaitingUploadCount={awaitingUpload ?? 0}
          requests={(requests ?? []) as PayRequestRow[]}
        />
      </main>
    </div>
  );
}
