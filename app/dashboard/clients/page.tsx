import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';

export const dynamic = 'force-dynamic';

const COLUMNS: Column<any>[] = [
  { key: 'name', header: 'Name', className: 'font-medium', cell: (c) => c.full_name },
  { key: 'brokerage', header: 'Brokerage', className: 'text-slate-700', cell: (c) => c.brokerage ?? '—' },
  { key: 'email', header: 'Email', className: 'text-slate-700', cell: (c) => c.email },
  { key: 'phone', header: 'Phone', className: 'text-slate-700', cell: (c) => c.phone ?? '—' },
];

export default async function ClientsPage() {
  const supabase = createClient();
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, full_name, email, brokerage, phone, created_at')
    .order('full_name', { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader title="Clients" subtitle="Real estate agents who've booked with you." />

      <DataTable
        columns={COLUMNS}
        rows={clients ?? []}
        rowKey={(c) => c.id}
        empty="No clients yet."
        error={error?.message ?? null}
      />
    </div>
  );
}
