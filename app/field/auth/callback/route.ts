import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeRelativePath } from '@/lib/utils/safe-redirect';

/**
 * Magic-link redirect handler for the contractor portal. Exchanges the code
 * for a session, then binds the contractors row (by email) to the auth user
 * via link_contractor_account(). Mirrors the client-portal callback.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeRelativePath(url.searchParams.get('next'), '/field/shoots');

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
    // Best-effort: bind contractors.auth_user_id by matching email.
    await supabase.rpc('link_contractor_account');
  }

  return NextResponse.redirect(new URL(next, request.url));
}
