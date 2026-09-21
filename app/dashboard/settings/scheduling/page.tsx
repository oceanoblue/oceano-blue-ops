import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsNav } from '@/components/layout/SettingsNav';
import { SchedulingSettingsForm } from '@/components/settings/SchedulingSettingsForm';

export const dynamic = 'force-dynamic';

export default async function SchedulingSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/settings/scheduling');

  const { data: settings, error } = await supabase
    .from('business_settings')
    .select('buffer_minutes, min_notice_hours, max_notice_days, default_timezone, business_name, raw_retention_days, assignment_timeout_minutes, auto_confirm_bookings')
    .eq('id', true)
    .maybeSingle();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Settings</h1>
        <p className="text-sm text-slate-600">
          Booking guards that apply to every client request.
        </p>
      </div>
      <SettingsNav />
      {error || !settings ? <p role="alert" className="card p-6 text-rose-700">Scheduling settings could not be loaded. Refresh the page to try again.</p> : <SchedulingSettingsForm initial={settings} />}
    </div>
  );
}
