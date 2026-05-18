import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildConsentUrl } from '@/lib/google-calendar/oauth';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Kicks off the Google OAuth consent flow. The current team_member.id is
 * encoded in `state` so the callback knows who to attach the tokens to.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/dashboard/settings/integrations', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));

  // state = team_member_id + random nonce (the nonce isn't stored — for v1 we
  // accept the small CSRF surface since the user is already authenticated).
  const state = `${user.id}.${randomBytes(8).toString('hex')}`;
  return NextResponse.redirect(buildConsentUrl(state));
}
