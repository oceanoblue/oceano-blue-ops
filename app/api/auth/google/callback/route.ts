import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { exchangeCodeForTokens, emailFromIdToken } from '@/lib/google-calendar/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const back = `${base}/dashboard/settings/integrations`;

  if (err || !code || !state) {
    return NextResponse.redirect(`${back}?gcal_error=${encodeURIComponent(err || 'missing_code')}`);
  }
  const teamMemberId = state.split('.')[0];
  if (!teamMemberId) {
    return NextResponse.redirect(`${back}?gcal_error=bad_state`);
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (e) {
    return NextResponse.redirect(
      `${back}?gcal_error=${encodeURIComponent(e instanceof Error ? e.message : 'exchange_failed')}`
    );
  }

  const supabase = createAdminClient();
  const accountEmail = emailFromIdToken(tokens.id_token);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase
    .from('team_calendar_connections')
    .upsert(
      {
        team_member_id: teamMemberId,
        provider: 'google',
        account_email: accountEmail,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        scope: tokens.scope,
        primary_calendar_id: 'primary',
        is_active: true,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'team_member_id,provider' }
    );

  return NextResponse.redirect(`${back}?gcal_connected=1`);
}
