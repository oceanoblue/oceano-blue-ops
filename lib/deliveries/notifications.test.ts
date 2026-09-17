import { beforeEach, expect, it, vi } from 'vitest';
import { sendDeliveryNotifications, type DeliveryDispatch } from './notifications';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { galleryReadyEmail } from '@/lib/email/templates';
vi.mock('@/lib/email/resend',()=>({sendEmail:vi.fn()}));
vi.mock('@/lib/integrations/quo',()=>({sendSms:vi.fn()}));
const job=():DeliveryDispatch=>({id:'request',order_id:'order',delivery_link_id:null,is_test:true,status:'sending',message:'Hello <script>alert(1)</script>',created_at:new Date().toISOString(),recipients:[{channel:'email',to:'me@example.test',name:'Me',status:'pending'},{channel:'sms',to:'+12025550123',name:'Me',status:'pending'}]});
const content={address:'Sample home',galleryUrl:'https://example.test/gallery/demo',locked:true};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(sendEmail).mockResolvedValue({status:'sent',id:'email1'});vi.mocked(sendSms).mockResolvedValue({status:'sent',id:'sms1'});});
it('persists each attempt before calling providers, and records their IDs independently',async()=>{
 const snapshots:any[]=[];const save=vi.fn(async r=>{snapshots.push(structuredClone(r));});
 const result=await sendDeliveryNotifications(job(),content,save);
 expect(snapshots.map(r=>r.map((x:any)=>x.status))).toEqual([['sending','pending'],['accepted','pending'],['accepted','sending'],['accepted','accepted']]);
 expect(result.map(r=>r.provider_id)).toEqual(['email1','sms1']);
 expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({to:'me@example.test',idempotencyKey:'gallery/request/0',subject:expect.stringContaining('[TEST]')}));
 expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({text:expect.stringContaining('/gallery/demo')}));
});
it('continues the independent channel when email is not configured',async()=>{
 vi.mocked(sendEmail).mockResolvedValue({status:'not_configured'});
 const result=await sendDeliveryNotifications(job(),content,async()=>{});
 expect(result.map(r=>r.status)).toEqual(['failed','accepted']);
});
it('never retries an interrupted SMS or already accepted email',async()=>{
 const d=job();d.recipients[0].status='accepted';d.recipients[1].status='sending';
 await sendDeliveryNotifications(d,content,async()=>{});
 expect(sendEmail).not.toHaveBeenCalled();expect(sendSms).not.toHaveBeenCalled();
});
it('requires review after an ambiguous timeout rather than claiming delivery',async()=>{
 vi.mocked(sendSms).mockResolvedValue({status:'failed',error:'timeout'});
 const result=await sendDeliveryNotifications(job(),content,async()=>{});
 expect(result[1].status).toBe('needs_review');
});
it('does not send when the pre-send record cannot be saved',async()=>{
 await expect(sendDeliveryNotifications(job(),content,async()=>{throw new Error('database unavailable');})).rejects.toThrow();
 expect(sendEmail).not.toHaveBeenCalled();expect(sendSms).not.toHaveBeenCalled();
});
it('escapes client-controlled text and accurately describes locked downloads',()=>{
 const {html}=galleryReadyEmail({...content,recipientName:'<img>',message:'<script>alert(1)</script>'});
 expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('Complete payment');
});
