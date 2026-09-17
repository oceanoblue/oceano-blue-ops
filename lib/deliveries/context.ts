import { createAdminClient } from '@/lib/supabase/server';
import { isDeliverable } from '@/lib/photos/deliverable';
import { paywallFor } from '@/lib/payments/gate';
import { isEmailConfigured } from '@/lib/email/resend';
import { isSmsConfigured, toE164US } from '@/lib/integrations/quo';

export async function deliveryContext(orderId: string) {
 const db=createAdminClient({noStore:true}) as any;
 const {data:order,error}=await db.from('orders').select('id,order_number,listing_id,client_id,status,total_cents,download_paid_at').eq('id',orderId).maybeSingle();
 if(error) throw new Error('Could not load order.');
 if(!order) return null;
 const results=await Promise.all([
  db.from('clients').select('full_name,email,phone').eq('id',order.client_id).maybeSingle(),
  db.from('listings').select('address_line1,city,state,zip').eq('id',order.listing_id).maybeSingle(),
  db.from('photos').select('id,is_hdr,ai_provider').eq('order_id',orderId).in('kind',['processed','delivered']).eq('is_selected',true),
  db.from('listing_deliverables').select('id').eq('listing_id',order.listing_id).eq('is_published',true),
  db.from('delivery_links').select('id,token,view_count,download_count').eq('order_id',orderId).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  db.from('gallery_dispatches').select('id,order_id,delivery_link_id,is_test,status,message,recipients,created_at').eq('order_id',orderId).order('created_at',{ascending:false}).limit(10),
  db.from('client_team_members').select('team_id').eq('client_id',order.client_id),
 ]);
 for(const result of results) if(result.error) throw new Error('Could not load delivery details.');
 const [owner,listing,photos,media,link,history,teams]=results;
 let teammates: {email:string;full_name:string|null}[]=[];
 if(teams.data?.length) {
  const {data,error}=await db.from('client_team_members').select('client:client_id(email,full_name)').in('team_id',teams.data.map((r:any)=>r.team_id)).eq('notify_on_delivery',true).neq('client_id',order.client_id);
  if(error) throw new Error('Could not load delivery recipients.');
  const unique=new Map<string,{email:string;full_name:string|null}>();
  for(const row of data??[]) if(row.client?.email && row.client.email.toLowerCase()!==owner.data?.email?.toLowerCase()) unique.set(row.client.email.toLowerCase(),row.client);
  teammates=[...unique.values()];
 }
 return {order,client:owner.data,listing:listing.data,photoCount:(photos.data??[]).filter(isDeliverable).length,mediaCount:media.data?.length??0,
  link:link.data,history:(history.data??[]).map((d:any)=>({...d,status:['sending','prepared'].includes(d.status)&&Date.now()-Date.parse(d.created_at)>300000?'needs_review':d.status})),teammates,paywall:paywallFor(order),
  channels:{email:isEmailConfigured(),sms:isSmsConfigured()},phone:toE164US(owner.data?.phone),
  appUrl:(process.env.NEXT_PUBLIC_APP_URL||'https://app.oceanoblue.net').replace(/\/$/,'')};
}
