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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/dashboard/settings/integrations', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));

  const {data:member}=await supabase.from('team_members').select('id,is_active').eq('id',user.id).maybeSingle();
  if(!member?.is_active)return new Response('Forbidden',{status:403});
  const state = `${user.id}.${randomBytes(32).toString('hex')}`;
  const response=NextResponse.redirect(buildConsentUrl(state));
  response.cookies.set('google_calendar_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:600,path:'/api/auth/google'});
  return response;
}
