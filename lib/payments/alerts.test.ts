import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runPaymentAlerts } from './alerts';
import { GET } from '@/app/api/cron/payment-alerts/route';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { paymentReceivedEmail } from '@/lib/email/templates';
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/email/resend', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/integrations/quo', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/observability/report', () => ({ captureError: vi.fn() }));
const rpc=vi.fn(),update=vi.fn(),save=vi.fn();
const content={orderNumber:70,amountCents:35000,paidAt:'2026-09-17T12:53:07Z',clientName:'Julie',address:'58 Cobia Court'};
const alert=(channel:string)=>({id:`alert-${channel}`,order_id:'order-70',channel,destination:channel==='email'?'owner@example.test':'+15555550100',content});
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('CRON_SECRET','test-secret');
  rpc.mockResolvedValue({data:[],error:null});save.mockResolvedValue({error:null});
  update.mockReturnValue({eq:()=>({eq:save})});
  vi.mocked(createAdminClient).mockReturnValue({rpc,from:()=>({update})} as any);
  vi.mocked(sendEmail).mockResolvedValue({status:'sent',id:'email-provider'});
  vi.mocked(sendSms).mockResolvedValue({status:'sent',id:'sms-provider'});
});
afterEach(()=>vi.unstubAllEnvs());
it('sends and records separate email and SMS confirmations',async()=>{
  rpc.mockResolvedValueOnce({data:[alert('email')]}).mockResolvedValueOnce({data:[alert('sms')]});
  expect(await runPaymentAlerts()).toEqual({accepted:2,review:0});
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({to:'owner@example.test',subject:'Payment received: $350.00 — Order #70',idempotencyKey:'payment-alert/alert-email'}));
  expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({to:'+15555550100',text:expect.stringContaining('$350.00 payment received')}));
  expect(update).toHaveBeenCalledWith(expect.objectContaining({status:'accepted',provider_id:'email-provider'}));
});
it('continues SMS if email result is ambiguous, without retrying email',async()=>{
  rpc.mockResolvedValueOnce({data:[alert('email')]}).mockResolvedValueOnce({data:[alert('sms')]});
  vi.mocked(sendEmail).mockResolvedValue({status:'failed',error:'timeout'});
  expect(await runPaymentAlerts()).toEqual({accepted:1,review:1});
  expect(update).toHaveBeenCalledWith(expect.objectContaining({status:'needs_review'}));
  expect(sendEmail).toHaveBeenCalledTimes(1);expect(sendSms).toHaveBeenCalledTimes(1);
});
it('does not send when the durable claim fails',async()=>{
  rpc.mockResolvedValue({error:{message:'offline'}});
  await expect(runPaymentAlerts()).rejects.toThrow('claim');expect(sendEmail).not.toHaveBeenCalled();
});
it('does not replay a send if saving its result fails',async()=>{
  rpc.mockResolvedValueOnce({data:[alert('email')]});save.mockResolvedValue({error:{message:'offline'}});
  await expect(runPaymentAlerts()).rejects.toThrow('record');expect(sendEmail).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledTimes(1);
});
it('never sends from preview deployments',async()=>{
  vi.stubEnv('VERCEL_ENV','preview');expect(await runPaymentAlerts()).toMatchObject({skipped:true});expect(rpc).not.toHaveBeenCalled();
});
it('requires the cron secret',async()=>{
  expect((await GET(new Request('https://example.test/api/cron/payment-alerts'))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('escapes client and property content in payment emails',()=>{
  const mail=paymentReceivedEmail({...content,clientName:'<script>alert(1)</script>',address:'A & B',orderUrl:'https://example.test/order'});
  expect(mail.html).not.toContain('<script>');expect(mail.html).toContain('&lt;script&gt;');expect(mail.html).toContain('A &amp; B');
});
