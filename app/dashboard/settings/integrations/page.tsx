import { encryptionConfigured } from '@/lib/google-calendar/token-encryption';
import { calendarNeedsReconnect } from '@/lib/google-calendar/health';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsNav } from '@/components/layout/SettingsNav';
import { CalendarBackfillButton } from '@/components/settings/CalendarBackfillButton';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage(
  props: {
    searchParams: Promise<{ gcal_error?: string; gcal_connected?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/settings/integrations');

  const { data: gcal } = await supabase
    .from('team_calendar_connections')
    .select('account_email, primary_calendar_id, is_active, scope, last_synced_at')
    .eq('team_member_id', user.id)
    .eq('provider', 'google')
    .maybeSingle();

  const gmailEnabled = process.env.GMAIL_INTEGRATION_ENABLED === 'true' && encryptionConfigured();
  const draftsEnabled = gmailEnabled && process.env.GMAIL_DRAFTS_ENABLED === 'true';
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Settings</h1>
        <p className="text-sm text-slate-600">Connect external services.</p>
      </div>
      <SettingsNav />

      {searchParams.gcal_error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <strong>Google Calendar connection failed:</strong>{' '}
          {searchParams.gcal_error === 'not_team_member'
            ? "Your auth account isn't linked to a team_member row yet. Ask an admin to add you."
            : searchParams.gcal_error}
        </div>
      )}
      {searchParams.gcal_connected && !gcal && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          OAuth completed but the connection didn&apos;t save. Check the database / logs.
        </div>
      )}

      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ocean-900">Google Calendar</h2>
            <p className="mt-1 text-sm text-slate-600">
              Push new bookings to your calendar and block availability for existing events.
            </p>
            {gcal ? (
              <div className="mt-3 text-sm">
                <span className={`pill ${calendarNeedsReconnect(gcal) ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
                  {calendarNeedsReconnect(gcal) ? 'Reconnect required' : 'Connected'}
                </span>
                {calendarNeedsReconnect(gcal) && <p className="mt-2 text-amber-900">Availability cannot be verified until you reconnect and approve calendar access.</p>}
                <span className="ml-2 text-slate-700">{(gcal as any).account_email}</span>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Not connected yet.</p>
            )}
          </div>
          {gcal ? (
            <div className="flex flex-wrap gap-2"><a href="/api/auth/google/connect" className="btn-primary text-sm">Reconnect Google Calendar</a><form action="/api/auth/google/disconnect" method="POST">
              <button className="btn-secondary text-sm">Disconnect</button>
            </form></div>
          ) : (
            <a href="/api/auth/google/connect" className="btn-primary text-sm">
              Connect Google Calendar
            </a>
          )}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Every shoot is pushed to the master <strong>info@oceanoblue.net</strong> calendar. The
          assigned photographer gets it on their own calendar too: if they&rsquo;ve connected Google
          here, a busy hold is written straight to their calendar; otherwise they&rsquo;re invited
          as a guest, which lands on any Gmail with an emailed invitation and no setup. Existing
          calendar events also block availability in the booking wizard.
        </p>
        {gcal && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <CalendarBackfillButton />
          </div>
        )}
      </section>
      <section className="card p-6">
        <h2 className="font-semibold text-ocean-900">Gmail for your morning brief</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Bring recent inbox previews into My Day. Your day planner can connect them to your calendar and production work. Prepare replies and editor handoffs, then save drafts to Gmail for review and sending.</p>
        <p className="mt-3 text-sm text-slate-600">{gcal?.is_active && gcal.scope?.split(/\s+/).includes('https://www.googleapis.com/auth/gmail.readonly') ? 'Inbox permission connected' : 'Gmail permission needed'} · {gcal?.scope?.split(/\s+/).includes('https://www.googleapis.com/auth/gmail.compose') ? 'Draft permission connected' : 'Draft permission needed'}</p>
        {gmailEnabled ? <div className="mt-4 flex flex-wrap gap-2"><a className="btn-primary" href="/api/auth/google/connect?gmail=1">Connect Gmail read-only</a>{draftsEnabled && <a className="btn-secondary" href="/api/auth/google/connect?gmail=1&drafts=1">Enable Gmail draft saving</a>}</div> : <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Gmail is disabled pending security setup. Your existing calendar connection remains available.</p>}
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-slate-500">Read-only is the default. Saving directly to Gmail requires a separate Google permission that also allows sending mail. Enable it only if you accept that added access; copying drafts needs no Gmail write permission.</p>
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-slate-500">Uses the same Google account as your calendar. Recent message previews are included in your private saved briefs and shared with your selected day-planner API provider when it runs. The app saves drafts only; send them in Gmail. Disconnecting Google above disconnects both services.</p>
      </section>
    </div>
  );
}
