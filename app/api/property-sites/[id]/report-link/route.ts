import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createAdminClient } from '@/lib/supabase/server';
import { reportHash } from '@/lib/marketing/report';
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
 const gate=await requireTeamMember();if(gate.error)return gate.error;
 const {id}=await params;const db=createAdminClient() as any;
 const {data:site}=await db.from('property_sites').select('order_id').eq('order_id',id).maybeSingle();if(!site)return new Response(null,{status:404});
 const token=randomBytes(32).toString('hex');const expires_at=new Date(Date.now()+180*86400000).toISOString();
 const {error}=await db.from('property_report_access').upsert({order_id:id,token_hash:reportHash(token),expires_at});
 return NextResponse.json(error?{error:'Unable to create report link.'}:{url:`/property-report/${token}`,expires_at},{status:error?503:200,headers:{'Cache-Control':'no-store'}});
}
export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){
 const gate=await requireTeamMember();if(gate.error)return gate.error;
 const {error}=await (createAdminClient() as any).from('property_report_access').delete().eq('order_id',(await params).id);
 return NextResponse.json({ok:!error},{status:error?503:200});
}
