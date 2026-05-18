import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsNav } from '@/components/layout/SettingsNav';
import { SchedulingSettingsForm } from '@/components/settings/SchedulingSettingsForm';

export const dynamic = 'force-dynamic';

export default async function SchedulingSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/settings/scheduling');

  const { data: settings } = await supabase
    .from('business_settings')
    .select('buffer_minutes, min_notice_hours, max_notice_days, default_timezone, business_name')
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
      <SchedulingSettingsForm
        initial={
          (settings as any) ?? {
            buffer_minutes: 30,
            min_notice_hours: 4,
            max_notice_days: 30,
            default_timezone: 'America/New_York',
            business_name: 'Oceano Blue',
          }
        }
      />
    </div>
  );
}
