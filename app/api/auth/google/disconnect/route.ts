import { openToken } from '@/lib/google-calendar/token-encryption';
import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revokeToken } from '@/lib/google-calendar/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 });
  const supabase = await createClient();
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
    const stored = row.refresh_token || row.access_token;
    const token = stored ? openToken(stored, user.id, row.refresh_token ? 'refresh' : 'access') : null;
    if (token) await revokeToken(token).catch(() => {});
    await admin
      .from('team_calendar_connections')
      .delete()
      .eq('team_member_id', user.id)
      .eq('provider', 'google');
  }
  const {data:member}=await supabase.from('team_members').select('role').eq('id',user.id).maybeSingle();
  return NextResponse.redirect(new URL(member?.role==='photographer'?'/field/availability':'/dashboard/settings/integrations', request.url));
}
