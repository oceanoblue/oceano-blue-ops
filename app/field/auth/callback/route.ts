import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeRelativePath } from '@/lib/utils/safe-redirect';
import { homeForUser } from '@/lib/auth/home-for-user';

/**
 * Magic-link redirect handler for the contractor portal. Exchanges the code
 * for a session, binds the contractors row (by email) to the auth user via
 * link_contractor_account(), then routes by identity (a client who used this
 * link by mistake still lands in the client portal).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const requested = url.searchParams.get('next');
  let next = safeRelativePath(requested, '/field/shoots');

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
    // Best-effort: bind contractors.auth_user_id by matching email.
    await supabase.rpc('link_contractor_account').then(() => null, () => null);
    if (!requested) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const home = user ? await homeForUser(supabase, user.id) : null;
      if (home) next = home;
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
