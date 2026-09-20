import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/server';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { isDeliverable } from '@/lib/photos/deliverable';
import { propertyMediaAllowed } from './property';
export const loadProperty=cache(async(slug:string,preview:boolean)=>{
  if(!/^[0-9a-f-]{36}$/i.test(slug))return null;
  const admin=createAdminClient({noStore:true}) as any;
  const {data:site,error:siteError}=await admin.from('property_sites').select('*').eq('slug',slug).maybeSingle();
  if(siteError)throw new Error('Property website unavailable.');if(!site)return null;
  if(!site.is_published){if(!preview)return null;const gate=await requireTeamMember();if(gate.error)return null;}
  const {data:order,error:orderError}=await admin.from('orders').select('id,listing_id,status,total_cents,download_paid_at').eq('id',site.order_id).maybeSingle();
  if(orderError)throw new Error('Property website unavailable.');if(!propertyMediaAllowed(order))return null;
  const [{data:listing,error:listingError},{data:photos,error:photoError}]=await Promise.all([
    admin.from('listings').select('address_line1,city,state,zip,bedrooms,bathrooms,sqft').eq('id',order.listing_id).single(),
    admin.from('photos').select('id,filename,bucket,storage_path,is_hdr,ai_provider').eq('order_id',order.id).eq('is_selected',true).in('kind',['processed','delivered']).order('sort_order').limit(100),
  ]);
  if(listingError||photoError)throw new Error('Property website unavailable.');
  const finals=(photos||[]).filter(isDeliverable);
  const images=await Promise.all(finals.map(async(p:any)=>{const {data,error}=await admin.storage.from(p.bucket).createSignedUrl(p.storage_path,900);if(error)throw new Error('Property photos unavailable.');return {id:p.id,url:data?.signedUrl,alt:p.filename.replace(/\.[^.]+$/,'')};}));
  return {site,listing,photos:images.filter(p=>p.url)};
});
