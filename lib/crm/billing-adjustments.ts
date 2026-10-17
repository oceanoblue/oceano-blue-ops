import type Stripe from 'stripe';
import {crmDb} from './server';
import {getStripe} from '@/lib/stripe/server';
export const billingAdjustmentTypes=new Set([
 'charge.refunded','charge.refund.updated','refund.created','refund.updated','refund.failed',
 'charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated',
]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ref=(v:unknown):string|null=>typeof v==='string'?v:v&&typeof v==='object'&&'id'in v&&typeof v.id==='string'?v.id:null;
const options={timeout:15000,maxNetworkRetries:0};
function stripeClient(){const stripe=getStripe();if(!stripe)throw new Error('Stripe is unavailable');return stripe;}
function association(session:Stripe.Checkout.Session,intent:Stripe.PaymentIntent,charge:Stripe.Charge,checkoutId:string){
 const pi=ref(session.payment_intent),chargePi=ref(charge.payment_intent);
 if(!uuid.test(checkoutId)||session.mode!=='payment'||session.payment_status!=='paid'||session.livemode!==true||intent.livemode!==true||charge.livemode!==true||pi!==intent.id||chargePi!==intent.id||intent.status!=='succeeded'||charge.status!=='succeeded'||!charge.paid||!charge.captured||!session.amount_total||!Number.isSafeInteger(session.amount_total)||charge.amount!==session.amount_total||charge.amount_captured!==session.amount_total||intent.amount_received!==session.amount_total||session.currency!==intent.currency||charge.currency!==session.currency)throw new Error('Exact live Stripe payment association could not be verified');
 return{checkout_id:checkoutId,session_id:session.id,payment_intent_id:intent.id,charge_id:charge.id,currency:charge.currency,amount_total:charge.amount,amount_refunded:charge.amount_refunded,charge_disputed:charge.disputed,livemode:true,provider_verified_at:new Date().toISOString()};
}
async function remember(checkoutId:string,evidence:ReturnType<typeof association>){const{error}=await crmDb().rpc('crm_billing_bind_stripe_payment',{p_checkout:checkoutId,p_evidence:evidence});if(error)throw new Error('Stripe payment association could not be saved');}
async function hold(checkoutId:string,eventId:string,type:string,evidence:object){const{error}=await crmDb().rpc('crm_billing_provider_hold',{p_checkout:checkoutId,p_event:eventId,p_type:type,p_evidence:evidence});if(error)throw new Error('Stripe adjustment hold could not be saved');}
/** Establish an immutable PI/charge association before automatic settlement.
 * If a refund/dispute already exists, preserve the receipt as a held event and
 * let the office reconcile instead of recording a gross payment as paid. */
export async function rememberBillingPayment(session:Stripe.Checkout.Session,eventId:string,eventType='checkout.session.completed'){
 const checkoutId=session.metadata?.crm_billing_checkout_id,piId=ref(session.payment_intent);
 if(!checkoutId||!piId)throw new Error('Project payment identity is missing');
 const stripe=stripeClient(),intent=await stripe.paymentIntents.retrieve(piId,{expand:['latest_charge']},options);
 const charge=typeof intent.latest_charge==='object'&&intent.latest_charge?intent.latest_charge as Stripe.Charge:null;
 if(!charge)throw new Error('Project payment charge could not be verified');
 const evidence=association(session,intent,charge,checkoutId);await remember(checkoutId,evidence);
 if(charge.amount_refunded>0||charge.disputed){await hold(checkoutId,eventId,eventType,{...evidence,reason:'Adjustment detected before automatic settlement'});return true;}
 return false;
}
/** Called only after the webhook verifies Stripe's raw-body signature. Provider
 * reads resolve exact existing IDs; event metadata never chooses an invoice by
 * name, customer, email or approximate amount. Unrelated charges are ignored. */
export async function holdCrmBillingProviderEvent(event:Stripe.Event){
 if(process.env.VERCEL_ENV!=='production')return{ignored:true,reason:'production_only'};
 if(!billingAdjustmentTypes.has(event.type))return{ignored:true,reason:'unhandled_type'};
 if(event.livemode!==true)return{ignored:true,reason:'test_mode'};
 const object=event.data.object as unknown as {id?:string;charge?:unknown;status?:string;amount?:number};
 const chargeId=event.type==='charge.refunded'?object.id:ref(object.charge);
 if(!chargeId)return{ignored:true,reason:'not_charge_backed'};
 const stripe=stripeClient(),charge=await stripe.charges.retrieve(chargeId,{expand:['payment_intent']},options);
 const piId=ref(charge.payment_intent);if(!piId)return{ignored:true,reason:'not_payment_intent_backed'};
 const intent=typeof charge.payment_intent==='object'&&charge.payment_intent?charge.payment_intent as Stripe.PaymentIntent:await stripe.paymentIntents.retrieve(piId,{},options);
 if(charge.id!==chargeId||charge.livemode!==true||intent.livemode!==true||intent.id!==piId)throw new Error('Adjustment payment identity could not be verified');
 const db=crmDb(),{data:known,error}=await db.from('crm_billing_stripe_payments').select('checkout_id,session_id,charge_id').eq('payment_intent_id',piId).maybeSingle();
 if(error)throw new Error('Payment association lookup is unavailable');
 let session:Stripe.Checkout.Session,checkoutId:string;
 if(known){
  if(known.charge_id!==chargeId)throw new Error('Adjustment charge differs from the recorded payment');
  session=await stripe.checkout.sessions.retrieve(known.session_id,{},options);checkoutId=known.checkout_id;
 }else{
  const sessions=await stripe.checkout.sessions.list({payment_intent:piId,limit:3},options);
  if(sessions.has_more)throw new Error('Payment association requires office review');
  const matches=sessions.data.filter(s=>ref(s.payment_intent)===piId&&uuid.test(s.metadata?.crm_billing_checkout_id??''));
  if(!matches.length){if(uuid.test(intent.metadata?.crm_billing_checkout_id??''))throw new Error('Claimed project checkout could not be verified');return{ignored:true,reason:'not_project_billing'};}
  if(matches.length!==1)throw new Error('Project payment association is ambiguous');
  session=matches[0];checkoutId=session.metadata!.crm_billing_checkout_id;
  const claimed=intent.metadata?.crm_billing_checkout_id;if(claimed&&claimed!==checkoutId)throw new Error('Provider payment metadata changed');
 }
 const evidence=association(session,intent,charge,checkoutId);await remember(checkoutId,evidence);
 await hold(checkoutId,event.id,event.type,{...evidence,signed_event:{id:event.id,type:event.type,created:event.created,object_id:object.id,status:object.status??null,amount:object.amount??null}});
 return{held:true};
}
