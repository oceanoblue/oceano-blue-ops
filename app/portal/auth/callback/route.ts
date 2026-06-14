import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeRelativePath } from '@/lib/utils/safe-redirect';

/**
 * Supabase magic-link redirect handler.
 * Exchanges the code in the URL for a session, then binds the client row
 * (by email) to the auth.user via the link_client_account() RPC.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  // Constrain `next` to a same-site path — never an attacker-supplied URL.
  const next = safeRelativePath(url.searchParams.get('next'), '/portal/listings');

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
    // Bind clients.auth_user_id by matching email. Best-effort.
    await supabase.rpc('link_client_account');
  }

  return NextResponse.redirect(new URL(next, request.url));
}
