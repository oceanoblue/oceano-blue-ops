import { beforeEach,expect,it,vi } from 'vitest';
import { POST as eventPOST } from '@/app/api/property-public/[slug]/events/route';
import { POST as inquiryPOST } from '@/app/api/property-public/[slug]/inquiries/route';
import { publishedProperty } from './public-access';
import { sendEmail } from '@/lib/email/resend';
vi.mock('./public-access',()=>({publishedProperty:vi.fn(),sameOrigin:(r:Request)=>r.headers.get('origin')===new URL(r.url).origin}));
vi.mock('@/lib/email/resend',()=>({sendEmail:vi.fn(async()=>({status:'sent'}))}));
vi.mock('@/lib/security/rate-limit',()=>({enforceRateLimit:vi.fn(async()=>null)}));
const id='00000000-0000-4000-8000-000000000001';const ctx={params:Promise.resolve({slug:'test-property'})};
const req=(data:any,origin='https://example.test')=>new Request('https://example.test/api',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
let upsert:any,update:any,lead:any,db:any;
beforeEach(()=>{
 vi.clearAllMocks();lead={id};upsert=vi.fn(()=>({select:()=>({maybeSingle:async()=>({data:lead,error:null})}),then:(resolve:any)=>Promise.resolve({error:null}).then(resolve)}));update=vi.fn(()=>({eq:vi.fn(async()=>({error:null}))}));db={from:vi.fn(()=>({upsert,update}))};
 vi.mocked(publishedProperty).mockResolvedValue({db,site:{order_id:id,headline:'Property',agent_email:'agent@example.test'}});
});
it('rejects cross-origin activity and inquiries, and closed properties',async()=>{
 const event={event:'page_view',session_id:id,event_id:id};expect((await eventPOST(req(event,'https://evil.test'),ctx)).status).toBe(403);expect(publishedProperty).not.toHaveBeenCalled();
 vi.mocked(publishedProperty).mockResolvedValue(null);expect((await eventPOST(req(event),ctx)).status).toBe(404);expect(upsert).not.toHaveBeenCalled();
});
it('saves leads before notifying and does not send duplicate notifications on retries',async()=>{
 const payload={name:'Buyer',email:'buyer@example.test',message:'Please arrange a showing.',consent:true,submission_id:id};
 expect((await inquiryPOST(req(payload),ctx)).status).toBe(200);expect(upsert).toHaveBeenCalledWith(expect.objectContaining({order_id:id,id}),{onConflict:'id',ignoreDuplicates:true});expect(sendEmail).toHaveBeenCalledTimes(1);expect(update).toHaveBeenCalledWith({notification_status:'sent'});
 lead=null;expect((await inquiryPOST(req(payload),ctx)).status).toBe(200);expect(sendEmail).toHaveBeenCalledTimes(1);
});
it('does not save honeypot submissions or notify an unconfigured recipient',async()=>{
 const payload={name:'Buyer',email:'buyer@example.test',message:'Hello',consent:true,submission_id:id,website:'spam'};
 expect((await inquiryPOST(req(payload),ctx)).status).toBe(200);expect(upsert).not.toHaveBeenCalled();
 vi.mocked(publishedProperty).mockResolvedValue({db,site:{order_id:id,headline:'Property',agent_email:''}});
 expect((await inquiryPOST(req({...payload,website:''}),ctx)).status).toBe(200);expect(sendEmail).not.toHaveBeenCalled();expect(update).toHaveBeenCalledWith({notification_status:'no_recipient'});
});
