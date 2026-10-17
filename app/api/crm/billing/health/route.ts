import {z} from 'zod';
import {crmActor,crmError,readJson,sameOrigin} from '@/lib/crm/server';
import {billingHealth,subscribeBillingEvents} from '@/lib/crm/billing-health';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){try{return Response.json(await billingHealth(await crmActor()),{headers});}catch(e){return crmError(e);}}
export async function POST(req:Request){try{const actor=await crmActor();sameOrigin(req);z.object({action:z.literal('subscribe_events'),confirm:z.literal(true)}).strict().parse(await readJson(req,500));return Response.json(await subscribeBillingEvents(actor),{headers});}catch(e){return crmError(e);}}
