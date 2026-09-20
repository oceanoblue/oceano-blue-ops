import { NextResponse } from 'next/server';
import { galleryAccess } from '@/lib/deliveries/token';
import { propertyMediaAllowed } from '@/lib/marketing/property';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{token:string}>}) {
 const {token}=await context.params;const a=await galleryAccess(token);if(a.error)return a.error;
 const {data:order,error}=await a.admin.from('orders').select('status,total_cents,download_paid_at').eq('id',a.link.order_id).maybeSingle();if(error)return NextResponse.json({error:'Unavailable'},{status:503});if(!propertyMediaAllowed(order))return NextResponse.json({url:null},{headers:{'Cache-Control':'private, no-store'}});
 const {data:site,error:siteError}=await (a.admin as any).from('property_sites').select('slug').eq('order_id',a.link.order_id).eq('is_published',true).maybeSingle();
 return NextResponse.json({url:site?`/property/${site.slug}`:null},{status:siteError?503:200,headers:{'Cache-Control':'private, no-store'}});
}
