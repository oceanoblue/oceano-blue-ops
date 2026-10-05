import { createAdminClient } from '@/lib/supabase/server';
import { createHash } from 'node:crypto';
export function reportHash(token:string){return createHash('sha256').update(token).digest('hex');}
export async function reportAccess(token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const db=createAdminClient({noStore:true}) as any;
 const {data,error}=await db.from('property_report_access').select('order_id').eq('token_hash',reportHash(token)).gt('expires_at',new Date().toISOString()).maybeSingle();
 return error||!data?null:{db,orderId:data.order_id};
}
export async function performance(db:any,orderId:string,days:number){
 const end=new Date();const start=new Date(end.getTime()-days*86400000);
 const [{data:stats,error},{data:leads,error:leadError},{data:site,error:siteError}]=await Promise.all([
  db.rpc('property_performance',{p_order_id:orderId,p_start:start.toISOString(),p_end:end.toISOString()}),
  db.from('property_inquiries').select('id,name,email,phone,message,source,campaign,created_at,notification_status').eq('order_id',orderId).gte('created_at',start.toISOString()).lt('created_at',end.toISOString()).order('created_at',{ascending:false}).limit(100),
  db.from('property_sites').select('headline').eq('order_id',orderId).maybeSingle()
 ]);
 if(error||leadError||siteError)throw new Error('Property reporting unavailable.');
 return {stats,leads:leads||[],headline:site?.headline||'Property performance',days};
}
export function reportDays(raw:string|null|undefined){return ['7','30','90','365'].includes(raw||'')?Number(raw):30;}
