import { NextResponse } from 'next/server';
import { inquirySchema } from '@/lib/marketing/performance';
import { publishedProperty,sameOrigin } from '@/lib/marketing/public-access';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { sendEmail } from '@/lib/email/resend';
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}) {
 if(!sameOrigin(request))return new Response(null,{status:403});
 const limited=await enforceRateLimit(request,'property-inquiries',5,600);if(limited)return limited;
 const parsed=inquirySchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Check your contact details and consent.'},{status:400});
 if(parsed.data.website)return NextResponse.json({ok:true});
 const access=await publishedProperty((await params).slug);if(!access)return NextResponse.json({error:'Property unavailable.'},{status:404});
 const {submission_id,website,consent,...data}=parsed.data;
 const {data:lead,error}=await access.db.from('property_inquiries').upsert({id:submission_id,order_id:access.site.order_id,...data},{onConflict:'id',ignoreDuplicates:true}).select('id').maybeSingle();
 if(error)return NextResponse.json({error:'Unable to save. Please try again.'},{status:503});
 if(lead){
  const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const result=access.site.agent_email?await sendEmail({to:access.site.agent_email,replyTo:data.email,subject:`Property inquiry: ${access.site.headline}`,html:`<h2>${escape(access.site.headline)}</h2><p>${escape(data.name)}<br/>${escape(data.email)}<br/>${escape(data.phone)}</p><p style="white-space:pre-wrap">${escape(data.message)}</p><p>Source: ${escape(data.source)} / ${escape(data.campaign)}</p>`,idempotencyKey:`property-inquiry-${submission_id}`}):{status:'no_recipient'};
  await access.db.from('property_inquiries').update({notification_status:result.status}).eq('id',lead.id);
 }
 return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}
