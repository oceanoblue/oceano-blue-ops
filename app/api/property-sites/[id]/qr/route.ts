import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createClient } from '@/lib/supabase/server';
import { campaignLink } from '@/lib/marketing/performance';
import QRCode from 'qrcode';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const gate=await requireTeamMember();if(gate.error)return gate.error;
 const db=await createClient() as any;const {data:site}=await db.from('property_sites').select('slug,url_slug,is_published').eq('order_id',(await params).id).maybeSingle();
 if(!site?.is_published)return new Response(null,{status:404});
 const svg=await QRCode.toString(campaignLink(`/property/${site.url_slug||site.slug}`,'print'),{type:'svg',margin:4,errorCorrectionLevel:'M'});
 return new Response(svg,{headers:{'Content-Type':'image/svg+xml','Content-Disposition':'attachment; filename="property-qr.svg"','Cache-Control':'private, no-store'}});
}
