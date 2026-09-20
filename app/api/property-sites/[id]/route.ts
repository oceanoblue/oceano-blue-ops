import { NextResponse } from 'next/server';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createClient } from '@/lib/supabase/server';
import { propertySchema,propertyMediaAllowed } from '@/lib/marketing/property';
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}) {
 const gate=await requireTeamMember();if(gate.error)return gate.error;
 const parsed=propertySchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Check the headline, contact details, and asking price.'},{status:400});
 const {id}=await params;const db=await createClient() as any;
 const {data:order,error}=await db.from('orders').select('status,total_cents,download_paid_at').eq('id',id).maybeSingle();
 if(error)return NextResponse.json({error:'Unable to verify the order.'},{status:503});if(!order)return NextResponse.json({error:'Order not found.'},{status:404});
 if(parsed.data.is_published&&!propertyMediaAllowed(order))return NextResponse.json({error:'Complete payment and activate the order before publishing.'},{status:409});
 const {data:site,error:saveError}=await db.from('property_sites').upsert({order_id:id,...parsed.data},{onConflict:'order_id'}).select('slug,is_published').single();
 return NextResponse.json(saveError?{error:'Unable to save the property website.'}:site,{status:saveError?503:200});
}
