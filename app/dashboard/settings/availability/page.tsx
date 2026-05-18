import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsNav } from '@/components/layout/SettingsNav';
import { AvailabilityEditor } from '@/components/settings/AvailabilityEditor';

export const dynamic = 'force-dynamic';

export default async function AvailabilitySettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/settings/availability');

  const { data: me } = await supabase
    .from('team_members')
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = (me as any)?.role === 'admin';

  // Admins see everyone; everyone else sees themselves
  const { data: members } = await supabase
    .from('team_members')
    .select('id, full_name, role')
    .in('role', ['admin', 'photographer'])
    .eq('is_active', true)
    .order('full_name');

  const visible = isAdmin ? members ?? [] : (members ?? []).filter((m: any) => m.id === user.id);

  const { data: rows } = await supabase
    .from('team_availability')
    .select('*')
    .in('team_member_id', visible.map((m: any) => m.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Settings</h1>
        <p className="text-sm text-slate-600">Working hours and availability.</p>
      </div>
      <SettingsNav />

      <p className="text-sm text-slate-600">
        Bookings are offered to clients only during these working hours. Days that aren't
        listed here are treated as days off.
      </p>

      <div className="space-y-8">
        {visible.map((m: any) => (
          <AvailabilityEditor
            key={m.id}
            member={m}
            rows={(rows ?? []).filter((r: any) => r.team_member_id === m.id)}
            canEdit={isAdmin || m.id === user.id}
          />
        ))}
      </div>
    </div>
  );
}
