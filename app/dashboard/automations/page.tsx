import { Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

const SCENARIO_COLUMNS: Column<any>[] = [
  { key: 'name', header: 'Scenario', className: 'font-medium text-slate-800', cell: (s) => s.name },
  { key: 'provider', header: 'Provider', className: 'capitalize text-slate-700', cell: (s) => s.provider },
  { key: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
];

const RUN_COLUMNS: Column<any>[] = [
  { key: 'provider', header: 'Provider', className: 'text-slate-700', cell: (r) => r.provider ?? r.tool_type },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  { key: 'when', header: 'When', className: 'text-slate-500', cell: (r) => new Date(r.created_at).toLocaleString() },
];

export default async function AutomationsPage() {
  const supabase = createClient();

  const [{ data: scenarios, error: scenariosError }, { data: runs, error: runsError }] = await Promise.all([
    supabase
      .from('automation_scenarios')
      .select('id, name, provider, status, is_active')
      .order('name'),
    supabase
      .from('tool_runs')
      .select('id, tool_type, provider, status, created_at')
      .eq('tool_type', 'make_scenario')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Automations"
        subtitle="Make.com scenarios and other automation runtimes. Runs are tracked as tool runs."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Scenarios</h2>
        <DataTable
          columns={SCENARIO_COLUMNS}
          rows={scenarios ?? []}
          rowKey={(s) => s.id}
          empty={
            <EmptyState
              compact
              icon={Zap}
              title="No scenarios yet"
              description="Connect Make.com scenarios to see them here."
            />
          }
          error={scenariosError?.message ?? null}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent scenario runs</h2>
        <DataTable
          columns={RUN_COLUMNS}
          rows={runs ?? []}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              compact
              icon={Zap}
              title="No scenario runs yet"
              description="Recent Make.com scenario runs will be tracked here."
            />
          }
          error={runsError?.message ?? null}
        />
      </section>
    </div>
  );
}
