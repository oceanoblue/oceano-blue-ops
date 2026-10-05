import { createAdminClient } from '@/lib/supabase/server';
import { propertyMediaAllowed } from './property';
export async function publishedProperty(slug:string) {
 if(!/^[a-z0-9-]{3,120}$/i.test(slug))return null;
 const db=createAdminClient({noStore:true}) as any;
 const {data:site,error}=await db.from('property_sites').select('order_id,headline,agent_email,is_published').eq(/^[0-9a-f-]{36}$/i.test(slug)?'slug':'url_slug',slug).eq('is_published',true).maybeSingle();
 if(error||!site)return null;
 const {data:order}=await db.from('orders').select('status,total_cents,download_paid_at').eq('id',site.order_id).maybeSingle();
 return propertyMediaAllowed(order)?{db,site}:null;
}
export function sameOrigin(request:Request) {return request.headers.get('origin')===new URL(request.url).origin;}
