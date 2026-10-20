import type Stripe from 'stripe';
import {rememberBillingPayment} from './billing-adjustments';
import { crmDb,CrmError } from './server';
import { positiveSourcePayments,type SourcePaymentObservation,type BillingData } from './billing-types';
import { getStripe,getBaseUrl } from '@/lib/stripe/server';
export async function billingRead():Promise<BillingData>{
 const db=crmDb();const results=await Promise.all([
 db.from('crm_billing_invoices').select('*,crm_billing_installments(*)').order('created_at',{ascending:false}).limit(501),
 db.from('crm_opportunities').select('id,project_id,title,project_date,next_follow_up,owner_id,clients(full_name,email),crm_stages(name,outcome)').order('project_date',{ascending:false,nullsFirst:false}).limit(1001),
 db.from('crm_billing_checkouts').select('id,invoice_id,received_cents,review_reason,settled_at').eq('status','review').order('created_at',{ascending:false}).limit(101),
 db.from('crm_billing_receipts').select('*').order('created_at',{ascending:false}).limit(501),
 db.from('crm_billing_checkouts').select('id,invoice_id,status,expires_at,stripe_session_id').in('status',['reserved','open']).order('created_at',{ascending:false}).limit(1001),
 db.from('crm_migration_observations').select('id,title,source_id,observed_at,review_state,next_action,follow_up_at,linked_ops_project,facts',{count:'exact'}).eq('source_kind','payment').in('review_state',['pending','active']).order('observed_at',{ascending:false}).limit(201),
 db.from('crm_billing_payment_events').select('event_id,invoice_id,event_type,payment_intent_id,charge_id,evidence,task_id,created_at').order('created_at',{ascending:false}).limit(101),
 ]);if(results.some(r=>r.error))throw new CrmError('Project billing is temporarily unavailable.',503);
 return{providerEvents:(results[6].data??[]).slice(0,100),sourcePayments:positiveSourcePayments((results[5].data??[]).slice(0,200) as SourcePaymentObservation[]),sourcePaymentsTruncated:(results[5].count??0)>200,invoices:(results[0].data??[]).slice(0,500),projects:(results[1].data??[]).slice(0,1000),reviews:(results[2].data??[]).slice(0,100),receipts:(results[3].data??[]).slice(0,500),checkouts:(results[4].data??[]).slice(0,1000),paymentsConfigured:!!process.env.STRIPE_SECRET_KEY,production:process.env.VERCEL_ENV==='production',truncated:results.some((r,i)=>(r.data?.length??0)>[500,1000,100,500,1000,200,100][i])} as unknown as BillingData;
}
export async function publicProjectBill(token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const db=crmDb();const{data,error}=await db.from('crm_billing_installments').select('id,title,amount_cents,paid_cents,due_date,due_date_verified,invoice_id').eq('access_token',token).maybeSingle();if(error)throw new CrmError('Payment is temporarily unavailable.',503);if(!data)return null;
 const{data:invoice,error:invoiceError}=await db.from('crm_billing_invoices').select('title,project_id,client_id,reconciliation,source_collection_stopped,collection_enabled,payment_review_required').eq('id',data.invoice_id).maybeSingle();if(invoiceError)throw new CrmError('Payment is temporarily unavailable.',503);if(!invoice)return null;
 const[{data:project,error:projectError},{data:review,error:reviewError},{data:client,error:clientError}]=await Promise.all([
 db.from('crm_opportunities').select('title,crm_stages!inner(outcome)').eq('project_id',invoice.project_id).maybeSingle(),
 db.from('crm_billing_checkouts').select('id').eq('invoice_id',data.invoice_id).eq('status','review').limit(1),db.from('clients').select('is_archived').eq('id',invoice.client_id).maybeSingle(),]);
 if(projectError||reviewError||clientError)throw new CrmError('Payment is temporarily unavailable.',503);
 const stage=(project?.crm_stages as unknown as {outcome:string}|null)?.outcome;
 return{title:invoice.title,project:project?.title??'Your project',installment:data.title,amount_cents:data.amount_cents,paid_cents:data.paid_cents,due_date:data.due_date,due_date_verified:data.due_date_verified,payment_review_required:!!invoice.payment_review_required,payable:!invoice.payment_review_required&&invoice.collection_enabled&&invoice.reconciliation==='verified'&&invoice.source_collection_stopped&&data.due_date_verified&&!!data.due_date&&['open','won'].includes(stage??'')&&!review?.length&&!!client&&!client.is_archived};
}
export async function settleCrmBillingCheckout(session:Stripe.Checkout.Session,eventId:string,eventType='checkout.session.completed'){
 if(process.env.VERCEL_ENV!=='production')return 'production_only';
 const id=session.metadata?.crm_billing_checkout_id;
 if(!id||session.mode!=='payment'||session.payment_status!=='paid')return;
 if(process.env.VERCEL_ENV==='production'&&session.livemode!==true)throw new Error('Test payments cannot settle a live project invoice');
 if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('Invalid CRM checkout metadata');
 if(await rememberBillingPayment(session,eventId,eventType))return 'provider_review';
 const{data,error}=await crmDb().rpc('crm_billing_settle',{p_id:id,p_session:session.id,p_event:eventId,p_amount:session.amount_total??-1,p_currency:session.currency??''});
 if(error)throw new Error('Project payment persistence failed');return data;
}
type CheckoutReservation={id:string;expected_cents:number;expires_at:string;stripe_session_id:string|null;stripe_payload_version?:number;return_path?:string|null};
function frozenCheckout(stripe:Stripe,ck:CheckoutReservation,title:string,token:string,req:Request){const base=getBaseUrl(req),returnPath=ck.return_path&&/^\/smart-files\/[a-f0-9]{64}$/.test(ck.return_path)?ck.return_path:`/pay/project/${token}`;return stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:ck.expected_cents,product_data:{name:title}}}],metadata:{crm_billing_checkout_id:ck.id},...(ck.stripe_payload_version&&ck.stripe_payload_version>=2?{payment_intent_data:{metadata:{crm_billing_checkout_id:ck.id}}}:{}),expires_at:Math.floor(Date.parse(ck.expires_at)/1000),success_url:`${base}${returnPath}?submitted=1`,cancel_url:`${base}${returnPath}`},{idempotencyKey:`crm-billing:${ck.id}`});}
export async function projectCheckout(token:string,req:Request):Promise<{url?:string;paid?:boolean}>{
 const stripe=getStripe();if(!stripe)throw new CrmError('Payments are temporarily unavailable.',503);
 const db=crmDb();
 for(let attempt=0;attempt<2;attempt++){
  const{data,error}=await db.rpc('crm_billing_reserve',{p_token:token});if(error)throw new CrmError('Payment could not be prepared.',503);if(data?.error)throw new CrmError(data.error,409);if(data?.paid)return{paid:true};
  const ck=data?.checkout;if(!ck)throw new CrmError('Payment could not be prepared.',503);
  if(ck.stripe_session_id){
   const session=await stripe.checkout.sessions.retrieve(ck.stripe_session_id);
   if(session.payment_status==='paid'){const settled=await settleCrmBillingCheckout(session,`retrieve:${session.id}`);if(['settled','already_settled'].includes(settled))return{paid:true};throw new CrmError('This payment needs office reconciliation. Please do not pay again.',409);}
   if(session.status==='expired'){
    const{error:expireError}=await db.rpc('crm_billing_expire',{p_id:ck.id,p_session:session.id});if(expireError)throw new CrmError('Payment could not be refreshed.',503);continue;
   }
   if(session.status==='open'&&session.url)return{url:session.url};
   throw new CrmError('This payment is processing. Please contact the office before paying again.',409);
  }
  if(Date.parse(ck.expires_at)-Date.now()<31*60000)throw new CrmError('The office needs to review an incomplete checkout before retrying.',409);
  const session=await frozenCheckout(stripe,ck,data.title,token,req);
  const{error:bindError}=await db.rpc('crm_billing_bind',{p_id:ck.id,p_session:session.id});if(bindError)throw new CrmError('Payment checkout needs office review. Please do not retry.',503);if(!session.url)throw new CrmError('Payment link unavailable.',503);return{url:session.url};
 }
 throw new CrmError('Please refresh and try again.',409);
}

/** Called only after an authenticated office action has held the invoice. A
 * provider timeout remains held. Reusing the exact original creation parameters
 * and idempotency key can recover a session without starting a second attempt. */
export async function refreshBillingCheckouts(invoiceId:string,req:Request):Promise<string[]>{
 const db=crmDb();const{data:rows,error}=await db.from('crm_billing_checkouts').select('*,crm_billing_invoices(title),crm_billing_installments(title,access_token)').eq('invoice_id',invoiceId).in('status',['reserved','open']).limit(36);
 if(error)return ['Collection is held. Checkout reconciliation is temporarily unavailable.'];
 if(!rows?.length)return [];
 const stripe=getStripe();if(!stripe)return ['Collection is held. Existing checkout links may still complete; reconcile them in Stripe before reactivating.'];
 const warnings:string[]=[];
 for(const raw of rows){const ck=raw as unknown as CheckoutReservation&{crm_billing_invoices:{title:string};crm_billing_installments:{title:string;access_token:string}};
  try{
   let session=ck.stripe_session_id?await stripe.checkout.sessions.retrieve(ck.stripe_session_id):await frozenCheckout(stripe,ck,`${ck.crm_billing_invoices.title} — ${ck.crm_billing_installments.title}`,ck.crm_billing_installments.access_token,req);
   if(!ck.stripe_session_id){const{error:bindError}=await db.rpc('crm_billing_bind',{p_id:ck.id,p_session:session.id});if(bindError)throw new Error('bind_failed');}
   if(session.payment_status==='paid'){await settleCrmBillingCheckout(session,`office_retrieve:${session.id}`);warnings.push('A payment was received and needs reconciliation before collection resumes.');continue;}
   if(session.status==='open')session=await stripe.checkout.sessions.expire(session.id);
   if(session.status==='expired'){const{error:expireError}=await db.rpc('crm_billing_expire',{p_id:ck.id,p_session:session.id});if(expireError)throw new Error('expiry_persistence_failed');}
   else warnings.push('A checkout is processing. Confirm its status in Stripe before requesting another payment.');
  }catch{warnings.push('An existing checkout needs manual Stripe reconciliation. Collection remains held; do not create another payment request.');}
 }
 return [...new Set(warnings)];
}
