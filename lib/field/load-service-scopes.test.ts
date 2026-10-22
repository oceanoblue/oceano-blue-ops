import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), contractor: vi.fn(), admin: vi.fn(), select: vi.fn(), rows: [] as any[], readError: null as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.user }, from: () => ({ select: () => ({ eq: (_: string, id: string) => ({ maybeSingle: () => mocks.contractor(id) }) }) }) }),
  createAdminClient: mocks.admin,
}));
import { loadFieldServiceScopes } from './load-service-scopes';
beforeEach(() => {
  vi.clearAllMocks(); mocks.readError = null;
  mocks.user.mockResolvedValue({ data: { user: { id: 'karen-user' } } });
  mocks.contractor.mockResolvedValue({ data: { id: 'karen', is_active: true } });
  mocks.rows = [
    { id: 'own', contractor_id: 'karen', total_cents: 99999, order_items: [{ description: '3D Home + Floor Plan' }] },
    { id: 'other', contractor_id: 'another-contractor', order_items: [{ description: 'Private other job' }] },
  ];
  mocks.admin.mockImplementation(() => ({ from: () => ({ select: (columns: string) => {
    mocks.select(columns);
    return { eq: (key: string, value: string) => ({ in: (_: string, ids: string[]) => Promise.resolve({ data: mocks.rows.filter(r => r[key] === value && ids.includes(r.id)), error: mocks.readError }) }) };
  } }) }));
});
it('rechecks ownership for requested IDs and returns only a price-free service summary', async () => {
  const result = await loadFieldServiceScopes(['own', 'other']);
  expect(mocks.contractor).toHaveBeenCalledWith('karen-user');
  expect([...result.keys()]).toEqual(['own']);
  expect(result.get('own')).toMatchObject({ has360: true, hasFloorPlan: true });
  expect(JSON.stringify([...result])).not.toContain('99999');
  expect(mocks.select.mock.calls[0][0]).not.toMatch(/price|total_cents|client_id|pay/);
  expect(mocks.admin).toHaveBeenCalledWith({ noStore: true });
});
it('denies unauthenticated access without making a privileged query', async () => {
  mocks.user.mockResolvedValue({ data: { user: null } });
  await expect(loadFieldServiceScopes(['own'])).rejects.toThrow('Sign in');
  expect(mocks.admin).not.toHaveBeenCalled();
});
it('denies non-contractors and reassigned orders', async () => {
  mocks.contractor.mockResolvedValue({ data: null });
  expect((await loadFieldServiceScopes(['own'])).size).toBe(0);
  expect(mocks.admin).not.toHaveBeenCalled();
  mocks.contractor.mockResolvedValue({ data: { id: 'karen', is_active: true } });
  mocks.rows[0].contractor_id = 'new-assignee';
  expect((await loadFieldServiceScopes(['own'])).size).toBe(0);
});
it('surfaces read failures instead of displaying an incomplete service list', async () => {
  mocks.readError = new Error('database unavailable');
  await expect(loadFieldServiceScopes(['own'])).rejects.toThrow('database unavailable');
});

it('does not read assignments for an inactive contractor', async () => {
  mocks.contractor.mockResolvedValue({ data: { id: 'karen', is_active: false } });
  expect((await loadFieldServiceScopes(['own'])).size).toBe(0);
  expect(mocks.admin).not.toHaveBeenCalled();
});
