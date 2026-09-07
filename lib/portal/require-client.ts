import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * The client portal must only ever show a CLIENT their own listings. All auth
 * pools (clients, contractor photographers, office staff) share one Supabase
 * auth, and RLS grants staff full read on listings/orders — so a team member
 * who lands on /portal (a photographer tapping the wrong sign-in link, say)
 * would otherwise see every listing and every shoot in the company.
 *
 * Resolve the caller's client identity (own row + client-team siblings). When
 * there is none, send them to the portal that IS theirs, or tell them this
 * login isn't a client account. Returns the client ids to filter queries with
 * explicitly, so pages never lean on RLS alone.
 */
export async function requireClientIds(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string[]> {
  const { data } = await supabase.rpc('current_client_ids');
  const ids = ((data ?? []) as string[]).filter(Boolean);
  if (ids.length > 0) return ids;

  // Not a client. A registered contractor belongs in the field portal…
  const { data: contractor } = await supabase
    .from('contractors')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (contractor) redirect('/field/shoots');

  // …and office staff in the dashboard.
  const { data: isStaff } = await supabase.rpc('is_team_member');
  if (isStaff) redirect('/dashboard');

  return [];
}
