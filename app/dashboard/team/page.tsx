import { redirect } from 'next/navigation';
import { Users2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { NewTeamMemberForm } from '@/components/team/NewTeamMemberForm';
import { TeamMemberPhone } from '@/components/team/TeamMemberPhone';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  photographer: 'Photographer',
  editor: 'Editor',
};

export default async function TeamPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('team_members').select('role').eq('id', user.id).maybeSingle();
  if (!me) redirect('/field/shoots'); // contractors/clients don't belong here
  const isAdmin = (me as any).role === 'admin';

  const [{ data: members }, { data: avail }] = await Promise.all([
    supabase.from('team_members').select('id, full_name, email, role, phone, is_active').order('full_name'),
    supabase.from('team_availability').select('team_member_id').eq('is_active', true),
  ]);

  // Which members have at least one active availability window?
  const scheduled = new Set((avail ?? []).map((a: any) => a.team_member_id));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        icon={Users2}
        title="Team"
        subtitle="Staff and photographers who log in, shoot, and edit. Contractors are managed separately under Photographers."
      >
        {isAdmin && <NewTeamMemberForm />}
      </PageHeader>

      {!isAdmin && (
        <p className="text-sm text-slate-500">Only an admin can add or change team members.</p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="table-head px-4 py-3">Name</th>
                <th className="table-head px-4 py-3">Email</th>
                <th className="table-head px-4 py-3">Phone</th>
                <th className="table-head px-4 py-3">Role</th>
                <th className="table-head px-4 py-3">Schedulable</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No team members yet.</td>
                </tr>
              ) : (
                (members ?? []).map((m: any) => {
                  const canSchedule = scheduled.has(m.id);
                  const isPhotog = m.role === 'photographer' || m.role === 'admin';
                  return (
                    <tr key={m.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink-900">{m.full_name}</span>
                        {!m.is_active && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{m.email}</td>
                      <td className="px-4 py-3">
                        <TeamMemberPhone memberId={m.id} initialPhone={m.phone ?? null} editable={isAdmin} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{ROLE_LABEL[m.role] ?? m.role}</td>
                      <td className="px-4 py-3">
                        {canSchedule ? (
                          <span className="text-emerald-700">Yes</span>
                        ) : isPhotog ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> No availability
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
