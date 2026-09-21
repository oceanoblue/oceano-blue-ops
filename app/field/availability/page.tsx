import { redirect } from 'next/navigation';
import { createClient,createAdminClient } from '@/lib/supabase/server';
import { AvailabilityEditor } from '@/components/settings/AvailabilityEditor';
import { PhotographerSettings } from '@/components/scheduling/PhotographerSettings';
import { calendarNeedsReconnect } from '@/lib/google-calendar/health';
import { FieldNav } from '@/components/field/FieldNav';
import { PortalHero } from '@/components/portal/PortalHero';
export const dynamic='force-dynamic';
export default async function FieldAvailability({searchParams}:{searchParams:Promise<{gcal_error?:string;gcal_connected?:string}>}) {
 const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/field');
 const {data:member}=await client.from('team_members').select('id,full_name,role,is_active').eq('id',user.id).maybeSingle();
 if(!member?.is_active||!['admin','photographer'].includes(member.role))redirect('/field/shoots');
 const admin=createAdminClient() as any;
 const [hours,blocks,connection]=await Promise.all([
  admin.from('team_availability').select('*').eq('team_member_id',user.id),
  admin.from('schedule_blocks').select('id,starts_at,ends_at,reason').eq('team_member_id',user.id).eq('is_available',false).or('reason.is.null,reason.not.like.sync:%').gte('ends_at',new Date().toISOString()).order('starts_at'),
  admin.from('team_calendar_connections').select('is_active,scope').eq('team_member_id',user.id).eq('provider','google').maybeSingle(),
 ]);
 const search=await searchParams;const status=!connection.data?'Not connected':calendarNeedsReconnect(connection.data)?'Reconnect required':'Connected';
 return <div className="min-h-screen bg-slate-50"><PortalHero eyebrow="Photographers" title="Your availability" subtitle="Keep your working hours, time off, and Google Calendar up to date."><FieldNav/></PortalHero><main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
 {search.gcal_error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">Google Calendar could not connect. Please try again or contact the office.</p>}
 {search.gcal_connected&&status==='Connected'&&<p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Your Google Calendar is connected.</p>}
 {hours.error||blocks.error||connection.error?<p role="alert">Availability could not load. Refresh before editing.</p>:<><AvailabilityEditor member={member} rows={hours.data||[]} canEdit/><PhotographerSettings member={member} profile={null} products={[]} blocks={blocks.data||[]} canRoute={false} canEdit self calendarStatus={status}/></>}
 </main></div>;
}
