import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverFollowup, type Followup } from './followups';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';
vi.mock('@/lib/email/resend', () => ({sendEmail: vi.fn()}));
vi.mock('@/lib/integrations/quo', () => ({sendSms: vi.fn()}));
vi.mock('@/lib/google-calendar/sync-shoot', () => ({syncShootCalendar: vi.fn()}));
const job = () => ({id:'request1',order_id:'order1',kind:'client_email',recipient:'client@example.test',attempts:1,lease_token:'lease',created_at:new Date().toISOString(),payload:{client_name:'Client',address_line1:'Test property',city:'Bluffton',state:'SC',zip:'29910',scheduled_at:'2026-09-10T14:00:00Z',timezone:'America/New_York'}} as Followup);
const {readOrder}=vi.hoisted(()=>({readOrder:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:readOrder})})})})}));
vi.mock('@/lib/field/respond-token',()=>({signRespondToken:()=> 'signed-versioned-token',respondPageUrl:()=> 'https://example.test/respond',respondTokenExpiry:()=>123}));
beforeEach(() => {vi.resetAllMocks();readOrder.mockResolvedValue({data:{status:'booked',assignment_state:'confirmed',assignment_round:1}});});
describe('booking follow-up delivery', () => {
  it('treats an email provider failure as a retryable failure', async () => {
    vi.mocked(sendEmail).mockResolvedValue({status:'failed',error:'temporary'});
    await expect(deliverFollowup(job())).rejects.toThrow('temporary');
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({idempotencyKey:'request1'}));
  });
  it('does not silently complete an unconfigured provider', async () => {
    vi.mocked(sendEmail).mockResolvedValue({status:'not_configured'});
    await expect(deliverFollowup(job())).rejects.toThrow('not_configured');
  });
  it('requires review after the provider deduplication window', async () => {
    await expect(deliverFollowup({...job(),created_at:new Date(Date.now()-24*3600000).toISOString()})).rejects.toThrow('email_delivery_review_required');
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('requires SMS failures to be surfaced for review', async () => {
    vi.mocked(sendSms).mockResolvedValue({status:'failed',error:'timeout'});
    await expect(deliverFollowup({...job(),kind:'office_sms'})).rejects.toThrow('timeout');
  });
  it('propagates calendar failure without invoking email or SMS', async () => {
    vi.mocked(syncShootCalendar).mockRejectedValue(new Error('calendar_reconnect_required'));
    await expect(deliverFollowup({...job(),kind:'calendar'})).rejects.toThrow('calendar_reconnect_required');
    expect(syncShootCalendar).toHaveBeenCalledWith('order1',{strict:true});
    expect(sendEmail).not.toHaveBeenCalled(); expect(sendSms).not.toHaveBeenCalled();
  });
});

it('sends updated appointment details for a reschedule with the event idempotency key', async () => {
  vi.mocked(sendEmail).mockResolvedValue({status:'sent',id:'email'} as any);
  const event = job(); event.payload.event='rescheduled'; event.payload.previous_scheduled_at='2026-09-09T14:00:00Z';
  await deliverFollowup(event);
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({subject:'Shoot rescheduled — Test property',idempotencyKey:'request1',html:expect.stringContaining('Previous appointment:')}));
  expect(sendSms).not.toHaveBeenCalled();
});

it('suppresses stale contractor requests and obsolete office alerts',async()=>{
  const event=job(); event.kind='assignment_email';event.payload.assignment_round=1;event.payload.contractor_id='contractor';
  readOrder.mockResolvedValue({data:{status:'booked',assignment_state:'awaiting_response',assignment_round:2,contractor_id:'contractor'}});
  await deliverFollowup(event);expect(sendEmail).not.toHaveBeenCalled();
  event.kind='office_attention';event.payload.assignment_state='rerouting';await deliverFollowup(event);expect(sendEmail).not.toHaveBeenCalled();
});
it('sends a current acceptance request with a deadline and versioned response link',async()=>{
  const event=job();event.kind='assignment_email';event.payload.assignment_round=1;event.payload.contractor_id='contractor';
  readOrder.mockResolvedValue({data:{status:'booked',assignment_state:'awaiting_response',assignment_round:1,contractor_id:'contractor',assignment_due_at:new Date(Date.now()+3600000).toISOString(),order_items:[{quantity:1,description:'Photography'}]}});
  vi.mocked(sendEmail).mockResolvedValue({status:'sent',id:'sent'} as any);
  await deliverFollowup(event);expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({subject:'Shoot request — Test property',html:expect.stringContaining('https://example.test/respond')}));
});
it('does not send a client confirmation from an obsolete assignment',async()=>{
  const event=job();event.payload.event='assignment_confirmed';event.payload.assignment_round=2;
  await deliverFollowup(event);expect(sendEmail).not.toHaveBeenCalled();
});
