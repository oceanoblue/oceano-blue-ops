import { crmError,CrmError,sameOrigin } from '@/lib/crm/server';
import { enforceCrmPublicRateLimit } from '@/lib/security/crm-public-rate-limit';
import { projectCheckout } from '@/lib/crm/billing-server';
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){try{sameOrigin(req);if(process.env.VERCEL_ENV!=='production')throw new CrmError('Payments are available on the production site.',403);const{token}=await params;if(!/^[a-f0-9]{64}$/.test(token))throw new CrmError('Payment link unavailable.',404);const limited=await enforceCrmPublicRateLimit(req,'project-checkout',20,3600);if(limited)return limited;return Response.json(await projectCheckout(token,req),{headers:{'Cache-Control':'no-store'}});}catch(e){return crmError(e);}}
