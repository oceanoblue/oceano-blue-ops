import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeRelativePath } from '@/lib/utils/safe-redirect';

/**
 * Supabase magic-link / password-recovery callback for the team app.
 * Exchanges the PKCE `?code=` for a session cookie, then redirects to
 * the `next` query param (or /dashboard by default).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  // Constrain `next` to a same-site path — never an attacker-supplied URL.
  const next = safeRelativePath(url.searchParams.get('next'), '/dashboard');

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, request.url));
}
