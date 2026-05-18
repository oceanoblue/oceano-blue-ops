import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revokeToken } from '@/lib/google-calendar/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('team_calendar_connections')
    .select('access_token, refresh_token')
    .eq('team_member_id', user.id)
    .eq('provider', 'google')
    .maybeSingle();
  if (row) {
    const token = (row as any).refresh_token || (row as any).access_token;
    if (token) await revokeToken(token).catch(() => {});
    await admin
      .from('team_calendar_connections')
      .delete()
      .eq('team_member_id', user.id)
      .eq('provider', 'google');
  }
  return NextResponse.redirect(new URL('/dashboard/settings/integrations', request.url));
}
