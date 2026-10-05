import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createClient } from '@/lib/supabase/server';
import { propertySchema } from '@/lib/marketing/property';
import { PropertyEditor } from '@/components/marketing/PropertyEditor';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}) {
 const gate=await requireTeamMember();if(gate.error)notFound();const {id}=await params;const db=await createClient() as any;
 const {data:order,error}=await db.from('orders').select('order_number,listings(address_line1)').eq('id',id).maybeSingle();if(error)throw new Error('Order unavailable.');if(!order)notFound();
 const {data:site,error:siteError}=await db.from('property_sites').select('*').eq('order_id',id).maybeSingle();if(siteError)throw new Error('Website settings unavailable.');
 const {data:photos}=await db.from('photos').select('id,filename').eq('order_id',id).eq('is_selected',true).in('kind',['processed','delivered']).order('sort_order').limit(100);
 const defaults={headline:order.listings?.address_line1||'Your property',description:'',agent_name:'',agent_phone:'',agent_email:'',asking_price_cents:null,is_published:false};
 const initial=propertySchema.parse({...defaults,...Object.fromEntries(Object.keys(propertySchema.shape).filter(key=>site&&site[key]!==undefined).map(key=>[key,site[key]]))});
 return <div className="space-y-6"><Link className="text-sm text-ocean-700 underline" href={`/dashboard/orders/${id}`}>← Order #{order.order_number}</Link><div><h1 className="text-2xl font-semibold">Property marketing</h1><p className="mt-1 text-sm text-slate-500">{order.listings?.address_line1}</p></div><PropertyEditor orderId={id} slug={site?.url_slug||site?.slug} initial={initial} photos={photos||[]}/></div>;
}
