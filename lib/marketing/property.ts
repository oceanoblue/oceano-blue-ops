import { z } from 'zod';
import { paywallFor } from '@/lib/payments/gate';
export const propertySchema=z.object({headline:z.string().trim().min(1).max(160),description:z.string().trim().max(5000),agent_name:z.string().trim().max(120),agent_phone:z.string().trim().max(40).regex(/^[0-9+(). x-]*$/),agent_email:z.union([z.literal(''),z.string().email().max(254)]),asking_price_cents:z.number().int().min(0).max(100000000000).nullable(),is_published:z.boolean()}).strict();
export function propertyMediaAllowed(order:{status:string;total_cents:number|null;download_paid_at:string|null}|null) {
 return !!order&&!['draft','cancelled'].includes(order.status)&&!paywallFor(order).active;
}
