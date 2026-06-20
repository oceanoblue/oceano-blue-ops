import { Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { NewClientForm } from '@/components/clients/NewClientForm';

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
      <PageHeader eyebrow="People" title="Clients" subtitle="Real estate agents you work with.">
        <div className="relative">
          <NewClientForm />
        </div>
      </PageHeader>

      <DataTable
        columns={COLUMNS}
        rows={clients ?? []}
        rowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add the agents you work with — use “Add client” above, or create one inline when you start a new listing."
          />
        }
        error={error?.message ?? null}
      />
    </div>
  );
}
