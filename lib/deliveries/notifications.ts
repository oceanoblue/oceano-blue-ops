import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { galleryReadyEmail, galleryReadySms } from '@/lib/email/templates';
export type DeliveryRecipient = {
 channel: 'email' | 'sms'; to: string; name: string | null;
 status: 'pending' | 'sending' | 'accepted' | 'failed' | 'needs_review';
 provider_id?: string; error?: string;
};
export type DeliveryDispatch = {
 id: string; order_id: string; delivery_link_id: string | null; is_test: boolean;
 status: string; message: string; recipients: DeliveryRecipient[]; created_at: string;
};
export type DeliveryContent = {
 address: string; cityStateZip?: string | null; galleryUrl: string;
 message?: string; photoCount?: number; locked?: boolean;
};
/** Persist before and after each provider call. Ambiguous sends are never automatically replayed. */
export async function sendDeliveryNotifications(dispatch: DeliveryDispatch, content: DeliveryContent,
 save: (recipients: DeliveryRecipient[]) => Promise<void>) {
 const recipients = dispatch.recipients.map(r => ({ ...r }));
 for (let i=0; i<recipients.length; i++) {
  const r=recipients[i];
  if(r.status!=='pending') continue;
  r.status='sending'; await save(recipients);
  try {
   if(r.channel==='email') {
    const email=galleryReadyEmail({...content,recipientName:r.name,message:dispatch.message,isTest:dispatch.is_test});
    const result=await sendEmail({to:r.to,...email,idempotencyKey:`gallery/${dispatch.id}/${i}`});
    if(result.status==='sent') {r.status='accepted';r.provider_id=result.id;}
    else if(result.status==='not_configured') {r.status='failed';r.error='Email is not configured.';}
    else {r.status='needs_review';r.error='Email was not confirmed. Check Resend before sending again.';}
   } else {
    const result=await sendSms({to:r.to,text:galleryReadySms({...content,recipientName:r.name,isTest:dispatch.is_test})});
    if(result.status==='sent') {r.status='accepted';r.provider_id=result.id;}
    else if(result.status==='not_configured'||result.status==='skipped') {r.status='failed';r.error='Text messaging is not configured or the number is invalid.';}
    else {r.status='needs_review';r.error='Text was not confirmed. Check Quo before sending again.';}
   }
  } catch {r.status='needs_review';r.error='Delivery response was interrupted. Check the provider before sending again.';}
  await save(recipients);
 }
 return recipients;
}
