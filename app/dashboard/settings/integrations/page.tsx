import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsNav } from '@/components/layout/SettingsNav';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/settings/integrations');

  const { data: gcal } = await supabase
    .from('team_calendar_connections')
    .select('account_email, primary_calendar_id, is_active, last_synced_at')
    .eq('team_member_id', user.id)
    .eq('provider', 'google')
    .maybeSingle();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Settings</h1>
        <p className="text-sm text-slate-600">Connect external services.</p>
      </div>
      <SettingsNav />

      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ocean-900">Google Calendar</h2>
            <p className="mt-1 text-sm text-slate-600">
              Push new bookings to your calendar and block availability for existing events.
            </p>
            {gcal ? (
              <div className="mt-3 text-sm">
                <span className="pill bg-emerald-100 text-emerald-800">Connected</span>
                <span className="ml-2 text-slate-700">{(gcal as any).account_email}</span>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Not connected yet.</p>
            )}
          </div>
          {gcal ? (
            <form action="/api/auth/google/disconnect" method="POST">
              <button className="btn-secondary text-sm">Disconnect</button>
            </form>
          ) : (
            <a href="/api/auth/google/connect" className="btn-primary text-sm">
              Connect Google Calendar
            </a>
          )}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Coming in the next deploy — wiring up the OAuth flow.
        </p>
      </section>
    </div>
  );
}
