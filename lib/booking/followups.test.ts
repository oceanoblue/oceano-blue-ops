import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverFollowup, type Followup } from './followups';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/integrations/quo';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';
vi.mock('@/lib/email/resend', () => ({sendEmail: vi.fn()}));
vi.mock('@/lib/integrations/quo', () => ({sendSms: vi.fn()}));
vi.mock('@/lib/google-calendar/sync-shoot', () => ({syncShootCalendar: vi.fn()}));
const job = () => ({id:'request1',order_id:'order1',kind:'client_email',recipient:'client@example.test',attempts:1,lease_token:'lease',created_at:new Date().toISOString(),payload:{client_name:'Client',address_line1:'Test property',city:'Bluffton',state:'SC',zip:'29910',scheduled_at:'2026-09-10T14:00:00Z',timezone:'America/New_York'}} as Followup);
beforeEach(() => vi.resetAllMocks());
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
