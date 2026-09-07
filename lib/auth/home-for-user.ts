import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Where does a signed-in person belong? All three audiences share one Supabase
 * auth pool, and the installed home-screen app always opens /portal — so the
 * entry points must route by identity, not by which door was tapped:
 *
 *   office staff (admin / coordinator / editor) → /dashboard
 *   contractor photographer                    → /field/shoots
 *   client                                     → /portal/listings
 *
 * A photographer-role team member is NOT office (see middleware) — they fall
 * through to the contractor check. Returns null when the login matches nothing.
 */
export async function homeForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<'/dashboard' | '/field/shoots' | '/portal/listings' | null> {
  const [{ data: me }, { data: contractor }, { data: clientIds }] = await Promise.all([
    supabase.from('team_members').select('role, is_active').eq('id', userId).maybeSingle(),
    supabase.from('contractors').select('id').eq('auth_user_id', userId).maybeSingle(),
    supabase.rpc('current_client_ids'),
  ]);

  if (me?.is_active && me.role !== 'photographer') return '/dashboard';
  if (contractor) return '/field/shoots';
  if (((clientIds ?? []) as string[]).length > 0) return '/portal/listings';
  return null;
}
