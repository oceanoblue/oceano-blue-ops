import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeRelativePath } from '@/lib/utils/safe-redirect';
import { homeForUser } from '@/lib/auth/home-for-user';

/**
 * Supabase magic-link redirect handler for the front door (/portal — also the
 * installed app's entry). Exchanges the code for a session, binds the client
 * and/or contractor row sharing this email (both best-effort, idempotent), then
 * sends the person to THEIR portal — a photographer who signed in here lands in
 * the field portal, not the client one.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  // Constrain `next` to a same-site path — never an attacker-supplied URL.
  const requested = url.searchParams.get('next');
  let next = safeRelativePath(requested, '/portal/listings');

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
    await Promise.all([
      supabase.rpc('link_client_account').then(() => null, () => null),
      supabase.rpc('link_contractor_account').then(() => null, () => null),
    ]);
    // Route by identity unless a specific same-site page was asked for.
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
