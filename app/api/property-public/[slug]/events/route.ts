import { NextResponse } from 'next/server';
import { eventSchema } from '@/lib/marketing/performance';
import { publishedProperty,sameOrigin } from '@/lib/marketing/public-access';
import { enforceRateLimit } from '@/lib/security/rate-limit';
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}) {
 if(!sameOrigin(request))return new Response(null,{status:403});
 const limited=await enforceRateLimit(request,'property-events',120,60);if(limited)return limited;
 const parsed=eventSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return new Response(null,{status:400});
 if(/bot|crawler|spider|headless/i.test(request.headers.get('user-agent')||''))return new Response(null,{status:204});
 const access=await publishedProperty((await params).slug);if(!access)return new Response(null,{status:404});
 const {event_id,...data}=parsed.data;
 const {error}=await access.db.from('property_events').upsert({id:event_id,order_id:access.site.order_id,...data},{onConflict:'id',ignoreDuplicates:true});
 return error?NextResponse.json({error:'Unable to record activity.'},{status:503}):new Response(null,{status:204});
}
