import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createClient } from '@/lib/supabase/server';
import { PropertyEditor } from '@/components/marketing/PropertyEditor';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}) {
 const gate=await requireTeamMember();if(gate.error)notFound();const {id}=await params;const db=await createClient() as any;
 const {data:order,error}=await db.from('orders').select('order_number,listings(address_line1)').eq('id',id).maybeSingle();if(error)throw new Error('Order unavailable.');if(!order)notFound();
 const {data:site,error:siteError}=await db.from('property_sites').select('*').eq('order_id',id).maybeSingle();if(siteError)throw new Error('Website settings unavailable.');
 return <div className="space-y-6"><Link className="text-sm text-ocean-700 underline" href={`/dashboard/orders/${id}`}>← Order #{order.order_number}</Link><div><h1 className="text-2xl font-semibold">Property website</h1><p className="mt-1 text-sm text-slate-500">{order.listings?.address_line1}</p></div><PropertyEditor orderId={id} slug={site?.slug} initial={site?{headline:site.headline,description:site.description,agent_name:site.agent_name,agent_phone:site.agent_phone,agent_email:site.agent_email,asking_price_cents:site.asking_price_cents,is_published:site.is_published}:{headline:order.listings?.address_line1||'Your property',description:'',agent_name:'',agent_phone:'',agent_email:'',asking_price_cents:null,is_published:false}}/></div>;
}
