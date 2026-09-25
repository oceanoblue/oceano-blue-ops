import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), order: vi.fn(), insert: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.user }, rpc: m.rpc }),
  createAdminClient: () => ({
    from: (table: string) => table === 'activity_log'
      ? { insert: m.insert }
      : { select: () => ({ eq: () => ({ maybeSingle: m.order }) }) },
  }),
}));
vi.mock('@/lib/email/resend', () => ({ sendEmail: m.send }));
import { POST } from '@/app/api/orders/[id]/resend-confirmation/route';
const post = () => POST(new Request('https://test/x', { method: 'POST' }), { params: Promise.resolve({ id: 'order1' }) });
const order = (over: any = {}) => ({ data: { id: 'order1', status: 'booked', scheduled_at: '2026-10-01T14:00:00Z', timezone: 'America/New_York', assignment_state: 'confirmed', clients: { full_name: 'Jane Doe', email: 'new@example.com' }, listings: { address_line1: '1 Ocean Dr', city: 'Savannah', state: 'GA', zip: '31401' }, ...over }, error: null });
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ data: { user: { id: 'staff' } } });
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.order.mockResolvedValue(order());
  m.send.mockResolvedValue({ status: 'sent', id: 'e1' });
  m.insert.mockResolvedValue({ error: null });
});
it('requires staff', async () => {
  m.rpc.mockResolvedValue({ data: false, error: null });
  expect((await post()).status).toBe(403);
  expect(m.send).not.toHaveBeenCalled();
});
it("sends the confirmation to the client's current email and logs it", async () => {
  const r = await post();
  expect(r.status).toBe(200);
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@example.com', subject: 'Shoot booked — 1 Ocean Dr' }));
  expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'booking_confirmation_resent', details: { to: 'new@example.com' } }));
});
it('uses the reserved wording while the photographer has not accepted yet', async () => {
  m.order.mockResolvedValue(order({ assignment_state: 'awaiting_response' }));
  await post();
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Time reserved — 1 Ocean Dr' }));
});
it('refuses cancelled orders and clients without an email', async () => {
  m.order.mockResolvedValue(order({ status: 'cancelled' }));
  expect((await post()).status).toBe(409);
  m.order.mockResolvedValue(order({ clients: { full_name: 'Jane', email: '' } }));
  expect((await post()).status).toBe(400);
  expect(m.send).not.toHaveBeenCalled();
});
it('reports a failed send instead of claiming success', async () => {
  m.send.mockResolvedValue({ status: 'failed', error: 'bounced' });
  const r = await post();
  expect(r.status).toBe(502);
  expect(m.insert).not.toHaveBeenCalled();
});
