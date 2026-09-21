import { redirect } from 'next/navigation';
import { PhotographerSettings } from '@/components/scheduling/PhotographerSettings';
import { calendarNeedsReconnect } from '@/lib/google-calendar/health';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { SettingsNav } from '@/components/layout/SettingsNav';
import { AvailabilityEditor } from '@/components/settings/AvailabilityEditor';

export const dynamic = 'force-dynamic';

export default async function AvailabilitySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/settings/availability');

  const { data: me } = await supabase
    .from('team_members')
    .select('id, full_name, role,is_active')
    .eq('id', user.id)
    .maybeSingle();

  if(!me?.is_active)redirect('/field/shoots');
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

  const admin=createAdminClient() as any;
  const [profiles,products,blocks,connections]=await Promise.all([
    admin.from('photographer_routing').select('*').in('team_member_id',visible.map(m=>m.id)),
    admin.from('products').select('id,name').eq('is_active',true).order('name'),
    admin.from('schedule_blocks').select('id,team_member_id,starts_at,ends_at,reason').in('team_member_id',visible.map(m=>m.id)).eq('is_available',false).gte('ends_at',new Date().toISOString()).order('starts_at'),
    admin.from('team_calendar_connections').select('team_member_id,is_active,scope').in('team_member_id',visible.map(m=>m.id)).eq('provider','google'),
  ]);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Settings</h1>
        <p className="text-sm text-slate-600">Working hours and availability.</p>
      </div>
      <SettingsNav />

      <p className="text-sm text-slate-600">
        Bookings are offered to clients only during these working hours. Days that aren&apos;t
        listed here are treated as days off.
      </p>

      <div className="space-y-8">
        {visible.map((m: any) => (
          <div key={m.id} className="space-y-4"><AvailabilityEditor
            member={m}
            rows={(rows ?? []).filter((r: any) => r.team_member_id === m.id)}
            canEdit={isAdmin || m.id === user.id}
          /><PhotographerSettings member={m} profile={profiles.data?.find((p:any)=>p.team_member_id===m.id)||null} products={products.data||[]} blocks={(blocks.data||[]).filter((b:any)=>b.team_member_id===m.id)} canRoute={isAdmin} canEdit={isAdmin||m.id===user.id} self={m.id===user.id} calendarStatus={(()=>{const c=connections.data?.find((c:any)=>c.team_member_id===m.id);return !c?'Not connected':calendarNeedsReconnect(c)?'Reconnect required':'Connected';})()}/></div>
        ))}
      </div>
    </div>
  );
}
