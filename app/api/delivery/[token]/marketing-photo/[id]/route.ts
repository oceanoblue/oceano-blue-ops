import sharp from 'sharp';
import { galleryAccess } from '@/lib/deliveries/token';
import { propertyMediaAllowed } from '@/lib/marketing/property';
import { isDeliverable } from '@/lib/photos/deliverable';
import { enforceRateLimit } from '@/lib/security/rate-limit';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{token:string;id:string}>}) {
 const limited=await enforceRateLimit(request,'marketing-photo',60,300);if(limited)return limited;
 const {token,id}=await params;const a=await galleryAccess(token);if(a.error)return a.error;
 const {data:order,error:orderError}=await a.admin.from('orders').select('status,total_cents,download_paid_at').eq('id',a.link.order_id).maybeSingle();if(orderError)return new Response('Unavailable',{status:503});if(!propertyMediaAllowed(order))return new Response('Payment required',{status:402});
 const {data:photo,error}=await a.admin.from('photos').select('bucket,storage_path,is_hdr,ai_provider').eq('id',id).eq('order_id',a.link.order_id).eq('is_selected',true).in('kind',['processed','delivered']).maybeSingle();
 if(error)return new Response('Unavailable',{status:503});if(!photo||!isDeliverable(photo))return new Response('Not found',{status:404});
 try{const {data,error:downloadError}=await a.admin.storage.from(photo.bucket).download(photo.storage_path);if(downloadError||!data)return new Response('Photo unavailable',{status:503});const bytes=await sharp(Buffer.from(await data.arrayBuffer())).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:92}).toBuffer();return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Photo unavailable',{status:503});}
}
