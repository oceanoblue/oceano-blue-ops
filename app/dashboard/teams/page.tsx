import { Users2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { NewTeamForm } from '@/components/teams/NewTeamForm';

export const dynamic = 'force-dynamic';

const COLUMNS: Column<any>[] = [
  { key: 'name', header: 'Team', className: 'font-medium', cell: (t) => t.name },
  { key: 'brokerage', header: 'Brokerage', className: 'text-slate-700', cell: (t) => t.brokerage ?? '—' },
  { key: 'members', header: 'Members', className: 'tabular-nums text-slate-700', cell: (t) => t.client_team_members?.[0]?.count ?? 0 },
  { key: 'created', header: 'Created', className: 'text-slate-500', cell: (t) => new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
];

export default async function TeamsPage() {
  const supabase = createClient() as any;
  const { data: teams, error } = await supabase
    .from('client_teams')
    .select('id, name, brokerage, created_at, client_team_members(count)')
    .order('name', { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="People" title="Client Teams" subtitle="Group an agent with their coordinator and co-agents so everyone shares the galleries.">
        <div className="relative">
          <NewTeamForm />
        </div>
      </PageHeader>

      <DataTable
        columns={COLUMNS}
        rows={teams ?? []}
        rowKey={(t) => t.id}
        rowHref={(t) => `/dashboard/teams/${t.id}`}
        empty={
          <EmptyState
            icon={Users2}
            title="No teams yet"
            description="Create a team, then add the agents and coordinators who all need the photos and videos."
          />
        }
        error={error?.message ?? null}
      />
    </div>
  );
}
