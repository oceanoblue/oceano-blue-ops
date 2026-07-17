import { redirect } from 'next/navigation';
import { Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { ContractorRoster, type ContractorRow } from '@/components/contractors/ContractorRoster';

export const dynamic = 'force-dynamic';

// A shoot counts toward pay once the RAWs are in (uploaded) and onward.
const PAYABLE = new Set(['uploaded', 'processing', 'editing', 'ready', 'delivered']);

export default async function ContractorsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Office-only page: a contractor who lands here is redirected to their portal.
  const { data: teamRow } = await supabase
    .from('team_members')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!teamRow) redirect('/field/shoots');

  const [{ data: contractors }, { data: orders }] = await Promise.all([
    supabase
      .from('contractors')
      .select('id, full_name, email, phone, pay_rate_cents, is_active, auth_user_id')
      .order('full_name', { ascending: true }),
    supabase
      .from('orders')
      .select('contractor_id, status, pay_status, pay_amount_cents, created_at')
      .not('contractor_id', 'is', null),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const byContractor = new Map<string, any[]>();
  (orders ?? []).forEach((o: any) => {
    const arr = byContractor.get(o.contractor_id) ?? [];
    arr.push(o);
    byContractor.set(o.contractor_id, arr);
  });

  const rows: ContractorRow[] = (contractors ?? []).map((c: any) => {
    const os = byContractor.get(c.id) ?? [];
    const payable = os.filter((o) => PAYABLE.has(o.status));
    const thisMonth = payable.filter((o) => new Date(o.created_at).getTime() >= monthStart).length;
    const unpaid = payable.filter((o) => o.pay_status === 'unpaid');
    return {
      id: c.id,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone,
      pay_rate_cents: c.pay_rate_cents,
      is_active: c.is_active,
      linked: Boolean(c.auth_user_id),
      total: payable.length,
      thisMonth,
      unpaidCount: unpaid.length,
      owedCents: unpaid.reduce((s, o) => s + (o.pay_amount_cents ?? 0), 0),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        icon={Camera}
        title="Photographers"
        subtitle="Your contractor photographers — properties shot and pay owed. They log shoots and upload RAWs from the field portal."
      />
      <ContractorRoster rows={rows} />
    </div>
  );
}
