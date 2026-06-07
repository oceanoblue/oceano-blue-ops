import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  connected: 'bg-emerald-100 text-emerald-700',
  not_connected: 'bg-slate-100 text-slate-600',
  error: 'bg-rose-100 text-rose-700',
  disabled: 'bg-slate-100 text-slate-400',
};

export default async function IntegrationsPage() {
  const supabase = createClient();
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id, provider, name, status, last_synced_at')
    .order('name');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Integrations</h1>
        <p className="text-sm text-slate-600">
          External tools Oceano Blue orchestrates. Connect them in a later phase.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(integrations ?? []).map((i: any) => (
          <div key={i.id} className="card flex items-center justify-between p-4">
            <div>
              <div className="font-medium text-ocean-900">{i.name}</div>
              <div className="text-xs text-slate-500">{i.provider}</div>
            </div>
            <span className={`pill ${STATUS_STYLES[i.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {i.status?.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
        {(integrations ?? []).length === 0 && (
          <div className="card p-6 text-sm text-slate-500">No integrations seeded yet.</div>
        )}
      </div>
    </div>
  );
}
