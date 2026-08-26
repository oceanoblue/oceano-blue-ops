import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Users2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TeamManager } from '@/components/teams/TeamManager';

export const dynamic = 'force-dynamic';

export default async function TeamDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient() as any;

  const { data: team } = await supabase
    .from('client_teams')
    .select('id, name, brokerage, notes')
    .eq('id', params.id)
    .maybeSingle();
  if (!team) notFound();

  const { data: members } = await supabase
    .from('client_team_members')
    .select('id, role, notify_on_delivery, client:client_id(id, full_name, email)')
    .eq('team_id', params.id)
    .order('created_at', { ascending: true });

  const { data: clients } = await supabase
    .from('clients')
    .select('id, full_name, email')
    .eq('is_archived', false)
    .order('full_name', { ascending: true });

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/dashboard/teams" className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Teams
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-ocean-100 text-ocean-700">
            <Users2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ocean-950">{team.name}</h1>
            <p className="text-sm text-slate-600">Everyone here shares the team&apos;s galleries, delivery emails, and can book on its behalf.</p>
          </div>
        </div>
      </div>

      <TeamManager team={team} members={members ?? []} clients={clients ?? []} />
    </div>
  );
}
