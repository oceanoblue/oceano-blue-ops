import {z} from 'zod';
import {crmActor,crmError} from '@/lib/crm/server';
import {inspectBillingReview} from '@/lib/crm/billing-review-server';
export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{await crmActor();const id=z.string().uuid().parse((await params).id);const data=await inspectBillingReview(id);return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});}catch(e){return crmError(e);}}
