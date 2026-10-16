import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { ContractorRoster, type ContractorRow } from '@/components/contractors/ContractorRoster';
import { PayRequestsPanel, type PendingPayRequest } from '@/components/contractors/PayRequestsPanel';
import { allPaymentRows, paymentLines, photoPaymentLine, PAYABLE_STATUSES } from '@/lib/contractor-work/payment-ledger';
import { ContractorWorkLinks } from '@/components/contractors/ContractorWorkLinks';
export const dynamic = 'force-dynamic';
const PAYABLE = new Set(PAYABLE_STATUSES);
export default async function ContractorsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: teamRow } = await supabase.from('team_members').select('id,role,is_active').eq('id', user.id).maybeSingle();
  if (!teamRow?.is_active) redirect('/field/shoots');
  const [{ data: contractors, error: contractorsError }, { data: orders, error: ordersError }, { data: pendingRequests, error: requestsError }, { data: hourlyBalances, error: hourlyError }, { data: hourlyWork, error: hourlyWorkError }] = await Promise.all([
    supabase.from('contractors').select('id, full_name, email, phone, pay_rate_small_cents, pay_rate_large_cents, pay_rate_360_cents, payout_method, payout_details, is_active, auth_user_id').order('full_name', { ascending: true }),
    allPaymentRows((from, to) => supabase.from('orders').select('id, order_number, contractor_id, status, pay_status, pay_amount_cents, created_at, scheduled_at, pay_request_id, listings(address_line1), pay_requests(paid_at, paid_note)').not('contractor_id', 'is', null).order('id').range(from, to)),
    allPaymentRows((from, to) => supabase.from('pay_requests').select('id, period_start, period_end, shoot_count, total_cents, notes, payout_method, payout_details, created_at, contractors(full_name, email)').eq('status', 'submitted').order('created_at', { ascending: true }).order('id').range(from, to)),
    (supabase as unknown as SupabaseClient).from('contractor_hourly_balances').select('*'),
    allPaymentRows((from, to) => (supabase as unknown as SupabaseClient).from('contractor_hourly_assignments').select('id, contractor_id, title, event_type, location, event_date, status, amount_cents, paid_at, paid_note').in('status', ['approved', 'paid']).order('id').range(from, to)),
  ]);
  if (contractorsError || ordersError || requestsError || hourlyError || hourlyWorkError) {
    return <div className="space-y-6"><PageHeader eyebrow="Library" icon={Camera} title="Contractors" subtitle="Shoots, hourly work and payments"/><p role="alert" className="card p-5 text-rose-700">Contractor payment records could not be loaded completely. Reload this page before settling payments.</p></div>;
  }
  const photoWork = (orders ?? []).filter((o): o is typeof o & { contractor_id: string } => o.contractor_id !== null);
  const lines = paymentLines(photoWork, hourlyWork ?? []);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const byContractor = new Map<string, any[]>();
  (orders ?? []).forEach((o: any) => { const arr = byContractor.get(o.contractor_id) ?? []; arr.push(o); byContractor.set(o.contractor_id, arr); });
  const rows: ContractorRow[] = (contractors ?? []).map((c: any) => {
    const hourly = (hourlyBalances ?? []).find((h: any) => h.contractor_id === c.id);
    const os = byContractor.get(c.id) ?? [];
    const payable = os.filter((o) => PAYABLE.has(o.status));
    const thisMonth = payable.filter((o) => new Date(o.created_at).getTime() >= monthStart).length;
    const unpaid = payable.filter((o) => o.pay_status === 'unpaid');
    return { paymentItems: lines.filter(item => item.contractorId === c.id), id: c.id, full_name: c.full_name, email: c.email, phone: c.phone, pay_rate_small_cents: c.pay_rate_small_cents, pay_rate_large_cents: c.pay_rate_large_cents, pay_rate_360_cents: c.pay_rate_360_cents, payout_method: c.payout_method, payout_details: c.payout_details, is_active: c.is_active, linked: Boolean(c.auth_user_id), total: payable.length, thisMonth, unpaidCount: unpaid.length, hourlyTotal: hourly?.total ?? 0, hourlyThisMonth: hourly?.this_month ?? 0, hourlyUnpaidCount: hourly?.unpaid_count ?? 0, hourlyOwedCents: Number(hourly?.owed_cents ?? 0), owedCents: unpaid.reduce((s, o) => s + (o.pay_amount_cents ?? 0), 0) + Number(hourly?.owed_cents ?? 0) };
  });
  const requests: PendingPayRequest[] = (pendingRequests ?? []).map((r: any) => ({ items: photoWork.filter(o => o.pay_request_id === r.id).map(photoPaymentLine), id: r.id, contractorName: r.contractors?.full_name ?? 'Unknown', contractorEmail: r.contractors?.email ?? '', periodStart: r.period_start, periodEnd: r.period_end, shootCount: r.shoot_count, totalCents: r.total_cents, notes: r.notes, payoutMethod: r.payout_method, payoutDetails: r.payout_details, submittedAt: r.created_at }));
  return <div className="space-y-6"><PageHeader eyebrow="Library" icon={Camera} title="Contractors" subtitle="Your contractor roster, property pay, hourly event work, agreements and video handoffs."/>{teamRow.role==='admin'&&teamRow.is_active&&<ContractorWorkLinks/>}<PayRequestsPanel requests={requests}/><ContractorRoster rows={rows}/></div>;
}
