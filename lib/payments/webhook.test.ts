import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { POST } from '@/app/api/stripe/webhook/route';
import { getStripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/server';
import {holdCrmBillingProviderEvent} from '@/lib/crm/billing-adjustments';
import { settleCrmBillingCheckout } from '@/lib/crm/billing-server';

vi.mock('@/lib/crm/billing-adjustments',async importOriginal=>({...await importOriginal<typeof import('@/lib/crm/billing-adjustments')>(),holdCrmBillingProviderEvent:vi.fn()}));
vi.mock('@/lib/stripe/server', () => ({ getStripe: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/observability/report', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/crm/billing-server', () => ({ settleCrmBillingCheckout: vi.fn() }));
const stripe = new Stripe('sk_test_local_fixture_only');
const secret = 'whsec_local_fixture_only';
const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
  vi.mocked(getStripe).mockReturnValue(stripe);
  rpc.mockResolvedValue({ data: 'paid', error: null });
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as any);
  vi.mocked(settleCrmBillingCheckout).mockResolvedValue('settled');
});
afterEach(() => vi.unstubAllEnvs());

function request(paymentStatus: string, type = 'checkout.session.completed', mode = 'payment', metadata: Record<string,string> = { order_id: '00000000-0000-4000-8000-000000000001' }) {
  const body = JSON.stringify({ id: 'evt_fixture', type, data: { object: {
    id: 'cs_fixture', mode, payment_status: paymentStatus, amount_total: paymentStatus === 'no_payment_required' ? 0 : 25000,
    metadata,
  } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request('https://example.com/api/stripe/webhook', {
    method: 'POST', body, headers: { 'stripe-signature': signature },
  });
}

it('does not unlock a completed checkout while payment remains unpaid', async () => {
  expect((await POST(request('unpaid'))).status).toBe(200);
  expect(rpc).not.toHaveBeenCalled();
});
it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])('unlocks settled payment from %s', async type => {
  expect((await POST(request('paid', type))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('settle_order_checkout', { p_order_id: '00000000-0000-4000-8000-000000000001', p_amount_cents: 25000, p_session_id: 'cs_fixture', p_revision: 0 });
});
it('allows a checkout fully covered by a promotion', async () => {
  expect((await POST(request('no_payment_required'))).status).toBe(200);
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith('settle_order_checkout', expect.objectContaining({ p_amount_cents: 0 }));
});
it('returns a retriable error if the payment cannot be persisted', async () => {
  rpc.mockResolvedValue({ error: { message: 'database unavailable' } });
  expect((await POST(request('paid'))).status).toBe(500);
});
it('rejects an unsigned payload before any database write', async () => {
  expect((await POST(new Request('https://example.com/api/stripe/webhook', { method: 'POST', body: '{}' }))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it('rejects a forged signature before any database write', async () => {
  const req = request('paid');
  req.headers.set('stripe-signature', 't=1,v1=forged');
  expect((await POST(req)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it('does not apply a subscription payment to order downloads', async () => {
  expect((await POST(request('paid', 'checkout.session.completed', 'subscription'))).status).toBe(200);
  expect(rpc).not.toHaveBeenCalled();
});

it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])('settles CRM project checkout from %s without touching order downloads', async type => {
  const metadata = { crm_billing_checkout_id: '00000000-0000-4000-8000-000000000002', order_id: '00000000-0000-4000-8000-000000000001' };
  expect((await POST(request('paid', type, 'payment', metadata))).status).toBe(200);
  expect(settleCrmBillingCheckout).toHaveBeenCalledWith(expect.objectContaining({ payment_status: 'paid', metadata }), 'evt_fixture', type);
  expect(rpc).not.toHaveBeenCalled();
});
it('does not settle an unpaid CRM checkout', async () => {
  expect((await POST(request('unpaid', 'checkout.session.completed', 'payment', { crm_billing_checkout_id: '00000000-0000-4000-8000-000000000002' }))).status).toBe(200);
  expect(settleCrmBillingCheckout).not.toHaveBeenCalled();
});
it('asks Stripe to retry if CRM payment persistence fails', async () => {
  vi.mocked(settleCrmBillingCheckout).mockRejectedValue(new Error('database unavailable'));
  expect((await POST(request('paid', 'checkout.session.completed', 'payment', { crm_billing_checkout_id: '00000000-0000-4000-8000-000000000002' }))).status).toBe(500);
  expect(rpc).not.toHaveBeenCalled();
});

it('routes signed refund events through exact project association and retries failed holds',async()=>{vi.mocked(holdCrmBillingProviderEvent).mockResolvedValue({held:true});expect((await POST(request('paid','charge.refunded'))).status).toBe(200);expect(holdCrmBillingProviderEvent).toHaveBeenCalledWith(expect.objectContaining({type:'charge.refunded'}));expect(rpc).not.toHaveBeenCalled();vi.mocked(holdCrmBillingProviderEvent).mockRejectedValue(new Error('offline'));expect((await POST(request('paid','charge.refunded'))).status).toBe(500);});
