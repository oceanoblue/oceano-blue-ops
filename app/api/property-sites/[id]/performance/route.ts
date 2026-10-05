import { NextResponse } from 'next/server';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createAdminClient } from '@/lib/supabase/server';
import { performance,reportDays } from '@/lib/marketing/report';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const gate=await requireTeamMember();if(gate.error)return gate.error;
 const data=await performance(createAdminClient(),(await params).id,reportDays(new URL(request.url).searchParams.get('days')));
 return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
}
