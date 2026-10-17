import { z } from 'zod';
const id=z.string().uuid();
const cents=z.number().int().min(0).max(2000000000);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Use a valid date.');
export const billingInvoiceSchema=z.object({
 project_id:id,title:z.string().trim().min(1).max(180),total_cents:cents,source_paid_cents:cents,
 source_system:z.enum(['honeybook','ops']),source_id:z.string().trim().min(1).max(240),source_url:z.union([z.literal(''),z.string().url().max(2000).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;},'Use an HTTPS source link without credentials.')]).default(''),
 evidence:z.record(z.unknown()).refine(v=>JSON.stringify(v).length<=60000,'Evidence is too large.'),evidence_checked_at:z.string().datetime(),
 installments:z.array(z.object({title:z.string().trim().min(1).max(180),amount_cents:cents.refine(v=>v>0),due_date:date.nullable(),due_date_verified:z.boolean().default(false)}).refine(v=>!v.due_date_verified||!!v.due_date,'Confirm a due date.')).max(36),
 follow_up_at:z.string().datetime().nullable().default(null),
}).superRefine((v,c)=>{if(v.source_paid_cents>v.total_cents)c.addIssue({code:'custom',message:'Paid credit exceeds total.',path:['source_paid_cents']});if(v.installments.reduce((n,i)=>n+i.amount_cents,0)!==v.total_cents-v.source_paid_cents)c.addIssue({code:'custom',message:'Remaining installments must match unpaid balance.',path:['installments']});});
export const billingActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('invoice_create'),id,data:billingInvoiceSchema}),
 z.object({action:z.literal('resolve_review'),id,version:z.number().int().positive(),data:z.object({resolution:z.enum(['credit','refund_verified']),note:z.string().trim().min(8).max(4000),confirm:z.literal(true)})}),
 z.object({action:z.literal('review'),id,version:z.number().int().positive(),data:z.object({reconciliation:z.enum(['pending','verified','disputed']),source_collection_stopped:z.boolean(),note:z.string().max(4000).default('')})}),
 z.object({action:z.literal('activate'),id,version:z.number().int().positive(),data:z.object({confirm:z.literal(true)})}),
 z.object({action:z.literal('refresh_checkouts'),id,version:z.number().int().positive(),data:z.object({})}),
 z.object({action:z.literal('hold'),id,version:z.number().int().positive(),data:z.object({})}),
 z.object({action:z.literal('record_payment'),id,version:z.number().int().positive(),data:z.object({amount_cents:cents.refine(v=>v>0),source_system:z.enum(['honeybook','bank','other']),source_id:z.string().trim().min(1).max(240),evidence:z.string().trim().min(1).max(4000),paid_at:z.string().datetime(),confirm_not_in_source_credit:z.literal(true)})}),
 z.object({action:z.literal('installment_date'),id,version:z.number().int().positive(),data:z.object({due_date:date.nullable(),due_date_verified:z.boolean()}).refine(v=>!v.due_date_verified||!!v.due_date,'Confirm a due date.')}),
]);
export type BillingInstallment={id:string;invoice_id:string;title:string;amount_cents:number;paid_cents:number;due_date:string|null;due_date_verified:boolean;access_token:string;version:number};
export type BillingInvoice={id:string;project_id:string;client_id:string;title:string;total_cents:number;source_paid_cents:number;source_system:string;source_id:string;source_url:string;evidence:Record<string,unknown>;evidence_checked_at:string;reconciliation:'pending'|'verified'|'disputed';source_collection_stopped:boolean;collection_enabled:boolean;review_note:string;version:number;crm_billing_installments:BillingInstallment[]};
export type BillingProject={id:string;project_id:string;title:string;project_date:string|null;next_follow_up:string|null;owner_id:string|null;clients:{full_name:string;email:string};crm_stages:{name:string;outcome:string}};
export type SourcePaymentObservation={id:string;title:string;source_id:string;observed_at:string;review_state:string;next_action:string;follow_up_at:string|null;linked_ops_project:string|null;facts:Record<string,unknown>};
export function positiveSourcePayments(rows:SourcePaymentObservation[]){return rows.filter(r=>['pending','active'].includes(r.review_state)&&typeof r.facts.source_outstanding_cents==='number'&&Number.isSafeInteger(r.facts.source_outstanding_cents)&&r.facts.source_outstanding_cents>0).map(r=>({...r,source_amount_cents:r.facts.source_outstanding_cents as number,source_due_date:typeof r.facts.source_due_date==='string'?r.facts.source_due_date:null}));}
export type BillingData={sourcePayments:ReturnType<typeof positiveSourcePayments>;sourcePaymentsTruncated:boolean;invoices:BillingInvoice[];projects:BillingProject[];checkouts:{id:string;invoice_id:string;status:string;expires_at:string;stripe_session_id:string|null}[];receipts:{id:string;invoice_id:string;installment_id:string;amount_cents:number;source_system:string;source_id:string;evidence:string;paid_at:string}[];reviews:{id:string;invoice_id:string;received_cents:number;review_reason:string;settled_at:string}[];paymentsConfigured:boolean;production:boolean;truncated:boolean};
export const remaining=(i:Pick<BillingInstallment,'amount_cents'|'paid_cents'>)=>Math.max(0,i.amount_cents-i.paid_cents);
export function billingHoldReasons(invoice:BillingInvoice):string[]{
 const reasons=[];if(invoice.reconciliation!=='verified')reasons.push(invoice.reconciliation==='disputed'?'Balance disputed':'Balance not verified');
 if(!invoice.source_collection_stopped)reasons.push('Source collections not confirmed stopped');
 if(invoice.crm_billing_installments.some(i=>remaining(i)>0&&(!i.due_date||!i.due_date_verified)))reasons.push('Due dates need verification');
 if(!invoice.collection_enabled)reasons.push('Collection held');return reasons;
}
export function billingSummary(invoices:BillingInvoice[],today:string){return invoices.reduce((a,v)=>{for(const i of v.crm_billing_installments){const b=remaining(i);a.outstanding+=b;if(b>0&&i.due_date_verified&&i.due_date&&i.due_date<today)a.overdue+=b;if(b>0&&(!i.due_date||!i.due_date_verified))a.unverified+=b;if(b>0&&!v.collection_enabled)a.held+=b;}return a;},{outstanding:0,overdue:0,unverified:0,held:0});}
