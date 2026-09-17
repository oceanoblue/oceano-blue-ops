import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createAdminClient } from '@/lib/supabase/server';
import { generateDeliveryToken } from '@/lib/utils/delivery-token';
import { deliveryContext } from '@/lib/deliveries/context';
import { sendDeliveryNotifications, type DeliveryRecipient, type DeliveryDispatch } from '@/lib/deliveries/notifications';
import { toE164US } from '@/lib/integrations/quo';
import { captureError } from '@/lib/observability/report';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic='force-dynamic';
export const maxDuration=120;
const Body=z.object({order_id:z.string().uuid(),action:z.enum(['prepare','deliver','test']).default('prepare'),
 request_id:z.string().uuid().optional(),email:z.boolean().default(true),sms:z.boolean().default(false),
 include_team:z.boolean().default(false),message:z.string().trim().max(1000).default(''),resend:z.boolean().default(false),
 test_email:z.string().email().optional(),test_phone:z.string().max(40).optional()});
const row=(data:any)=>Array.isArray(data)?data[0]:data;
const fail=(message:string,status=400)=>NextResponse.json({error:message},{status});

export async function GET(request:Request) {
 const gate=await requireTeamMember(); if(gate.error)return gate.error;
 const id=new URL(request.url).searchParams.get('order_id');
 if(!z.string().uuid().safeParse(id).success)return fail('Choose a valid order.');
 try {const data=await deliveryContext(id!);return data?NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}}):fail('Order not found.',404);}
 catch {return fail('Could not load delivery details. Please try again.',503);}
}

export async function POST(request:Request) {
 const gate=await requireTeamMember(); if(gate.error)return gate.error;
 const parsed=Body.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return fail('Please check the delivery details.');
 const b=parsed.data;
 const limited=await enforceRateLimit(request,`gallery-send:${gate.user.id}`,20,60);if(limited)return limited;
 const db=createAdminClient({noStore:true}) as any;
 try {
  const c=await deliveryContext(b.order_id);if(!c)return fail('Order not found.',404);
  const test=b.action==='test';
  if(!test && !c.photoCount && !c.mediaCount)return fail('Select finished photos or publish media before delivering.');
  if(b.action==='prepare') {
   const {data:linkData,error}=await db.rpc('prepare_gallery_link',{p_order:b.order_id,p_actor:gate.user.id,p_token:generateDeliveryToken()});
   if(error)throw error;
   const l=row(linkData);
   return NextResponse.json({...l,url:`${c.appUrl}/gallery/${l.token}`});
  }
  if(!b.request_id)return fail('A delivery request ID is required.');
  if(!b.email&&!b.sms)return fail('Choose email, text, or both.');
  if(b.email&&!c.channels.email)return fail('Email is not configured.');
  if(b.sms&&!c.channels.sms)return fail('Text messaging is not configured.');
  const recipients:DeliveryRecipient[]=[];
  if(b.email) {
   const to=test?b.test_email:c.client?.email;
   if(!to||!z.string().email().safeParse(to).success)return fail('A valid recipient email is required.');
   recipients.push({channel:'email',to,name:test?'Test recipient':c.client?.full_name,status:'pending'});
   if(!test&&b.include_team) for(const m of c.teammates) recipients.push({channel:'email',to:m.email,name:m.full_name,status:'pending'});
  }
  if(b.sms) {
   const to=toE164US(test?b.test_phone:c.phone);if(!to)return fail('A valid recipient mobile number is required.');
   recipients.push({channel:'sms',to,name:test?'Test recipient':c.client?.full_name,status:'pending'});
  }
  if(recipients.length>8)return fail('Send to at most eight recipients at a time. Turn off teammate emails to send to the client first.');
  const fingerprint=createHash('sha256').update(JSON.stringify({order:b.order_id,test,message:b.message,recipients})).digest('hex');
  const {data:prepared,error}=await db.rpc('prepare_gallery_dispatch',{p_id:b.request_id,p_order:b.order_id,p_actor:gate.user.id,
   p_token:generateDeliveryToken(),p_fingerprint:fingerprint,p_message:b.message,p_recipients:recipients,p_test:test,p_resend:b.resend});
  if(error) {
   if(/request_changed|delivery_in_progress|confirm_resend/.test(error.message))return fail('A delivery already exists or is in progress. Refresh its status before explicitly sending again.',409);
   throw error;
  }
  const d=row(prepared) as DeliveryDispatch;
  // Exactly one caller can own a request, even if the browser retries after a timeout.
  const {data:claimed,error:claimError}=await db.from('gallery_dispatches').update({status:'sending'}).eq('id',d.id).eq('status','prepared').select('id').maybeSingle();
  if(claimError)throw claimError;
  if(!claimed)return NextResponse.json({dispatch:d,replayed:true});
  let galleryUrl=`${c.appUrl}/gallery/demo`;
  if(!test) {
   const {data:l,error:linkError}=await db.from('delivery_links').select('token').eq('id',d.delivery_link_id).single();
   if(linkError)throw linkError;
   galleryUrl=`${c.appUrl}/gallery/${l.token}`;
  }
  await sendDeliveryNotifications(d,{address:test?'Coastal Home · Sample gallery':c.listing?.address_line1||`Order #${c.order.order_number}`,
   cityStateZip:test?'Lowcountry, South Carolina':[c.listing?.city,c.listing?.state,c.listing?.zip].filter(Boolean).join(', '),
   galleryUrl,photoCount:test?6:c.photoCount,locked:test?false:c.paywall.active},async recipients=>{
    const {error}=await db.from('gallery_dispatches').update({recipients}).eq('id',d.id).eq('status','sending');if(error)throw error;
   });
  const {data:finished,error:finishError}=await db.rpc('finish_gallery_dispatch',{p_id:d.id});if(finishError)throw finishError;
  return NextResponse.json({dispatch:row(finished),url:galleryUrl});
 } catch (error) {
  captureError('gallery.delivery',error,{orderId:b.order_id});
  return fail('Delivery could not be confirmed. Refresh the delivery history before sending again; a message may already have been accepted.',503);
 }
}
