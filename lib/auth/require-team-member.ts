import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Staff authorization gate for API route handlers.
 *
 * Authentication (a valid session) is NOT the same as authorization (being
 * staff): contractors and clients sign in with the same Supabase magic-link
 * pool as the office, so `getUser()` alone lets any contractor/client — or, with
 * open self-signup, any member of the public — reach office endpoints. Many of
 * those endpoints use the service-role admin client, which bypasses RLS, so the
 * staff check MUST be explicit in code.
 *
 * `is_team_member()` is a SECURITY DEFINER function keyed on auth.uid(); calling
 * it through the caller's own session client is safe and reliable.
 *
 * Usage:
 *   const gate = await requireTeamMember();
 *   if (gate.error) return gate.error;      // 401 or 403 already formed
 *   const { user } = gate;                  // authenticated staff user
 *
 * The middleware applies the same gate broadly; this is defense-in-depth so a
 * handler is safe even if reached directly (e.g. it lives under a public path
 * prefix that the middleware waves through).
 */
export async function requireTeamMember(): Promise<
  { error: NextResponse; user: null } | { error: null; user: User }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }), user: null };
  }

  const { data: isStaff, error } = await supabase.rpc('is_team_member');
  if (error || !isStaff) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }), user: null };
  }

  return { error: null, user };
}
