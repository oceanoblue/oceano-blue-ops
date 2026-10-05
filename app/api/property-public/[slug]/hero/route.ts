import { loadProperty } from '@/lib/marketing/load-property';
import { enforceRateLimit } from '@/lib/security/rate-limit';
export async function GET(request:Request,{params}:{params:Promise<{slug:string}>}){
 const limited=await enforceRateLimit(request,'property-hero',60,300);if(limited)return limited;
 const data=await loadProperty((await params).slug,false);if(!data?.photos[0])return new Response(null,{status:404});
 return new Response(null,{status:307,headers:{Location:data.photos[0].url!,'Cache-Control':'no-store'}});
}
