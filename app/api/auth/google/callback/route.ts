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
  const accountEmail = emailFromIdToken(tokens.id_token);
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

  if (upsertErr) {
    return NextResponse.redirect(
      `${back}?gcal_error=${encodeURIComponent(upsertErr.message)}`
    );
  }
  return NextResponse.redirect(`${back}?gcal_connected=1`);
}
