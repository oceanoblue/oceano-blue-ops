import { encryptionConfigured, openToken, sealToken } from '@/lib/google-calendar/token-encryption';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { exchangeCodeForTokens, emailFromIdToken } from '@/lib/google-calendar/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  const {data:member}=user?await client.from('team_members').select('role,is_active').eq('id',user.id).maybeSingle():{data:null};
  const back = `${base}${member?.role==='photographer'?'/field/availability':'/dashboard/settings/integrations'}`;

  if (err || !code || !state) {
    return NextResponse.redirect(`${back}?gcal_error=${encodeURIComponent(err || 'missing_code')}`);
  }
  const cookieStore=await cookies();
  const expected=cookieStore.get('google_calendar_state')?.value;
  cookieStore.delete({name:'google_calendar_state',path:'/api/auth/google'});
  const teamMemberId = state.split('.')[0];
  if (!expected || state!==expected || !user || !member?.is_active || teamMemberId!==user.id) {
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
  const { data: previous, error: previousError } = await supabase.from('team_calendar_connections')
    .select('refresh_token,account_email').eq('team_member_id', teamMemberId).eq('provider', 'google').maybeSingle();
  if (previousError) return NextResponse.redirect(`${back}?gcal_error=connection_read_failed`);
  // userinfo is authorized by the existing email scope. Never reuse a refresh
  // token from a different Google account when incremental consent omits one.
  let accountEmail = emailFromIdToken(tokens.id_token);
  if (!accountEmail) {
    try {
      const profile = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(8000), cache: 'no-store',
      });
      if (profile.ok) accountEmail = (await profile.json()).email ?? null;
    } catch { /* Require a fresh refresh token when account identity is unknown. */ }
  }
  const refreshToken = tokens.refresh_token ||
    (accountEmail && accountEmail === previous?.account_email ? (previous.refresh_token ? openToken(previous.refresh_token, teamMemberId, 'refresh') : null) : null);
  if (!refreshToken) return NextResponse.redirect(`${back}?gcal_error=offline_access_required`);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Guard against the foreign-key failure when the auth user isn't a team_member yet.
  const { data: tmCheck } = await supabase
    .from('team_members')
    .select('id')
    .eq('id', teamMemberId)
    .eq('is_active',true)
    .maybeSingle();
  if (!tmCheck) {
    return NextResponse.redirect(`${back}?gcal_error=not_team_member`);
  }

  const { error: upsertErr } = await supabase
    .from('team_calendar_connections')
    .upsert(
      {
        team_member_id: teamMemberId,
        provider: 'google',
        account_email: accountEmail,
        access_token: encryptionConfigured() ? sealToken(tokens.access_token, teamMemberId, 'access') : tokens.access_token,
        refresh_token: encryptionConfigured() ? sealToken(refreshToken, teamMemberId, 'refresh') : refreshToken,
        expires_at: expiresAt,
        scope: tokens.scope,
        primary_calendar_id: 'primary',
        is_active: true,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'team_member_id,provider' }
    );

  if (upsertErr) {
    return NextResponse.redirect(
      `${back}?gcal_error=connection_save_failed`
    );
  }
  return NextResponse.redirect(`${back}?gcal_connected=1`);
}
