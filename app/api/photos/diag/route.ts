import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

/**
 * Temporary auth diagnostic. Open directly in the browser while logged in:
 *   https://oceano-blue-ops.vercel.app/api/photos/diag
 *
 * Reports whether THIS /api/photos/* route handler actually receives the auth
 * cookies and whether getUser() succeeds — the question behind the convert /
 * raw-preview 401s. Returns 200 regardless so the result is always visible.
 * No secrets: cookie NAMES only, never values. Remove once diagnosed.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const all = cookies().getAll();
  return NextResponse.json({
    route: '/api/photos/diag',
    authenticated: Boolean(user),
    userEmail: user?.email ?? null,
    authError: error?.message ?? null,
    totalCookies: all.length,
    sbCookieNames: all.map((c) => c.name).filter((n) => n.startsWith('sb-')),
  });
}
