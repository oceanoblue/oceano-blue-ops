import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('./server', async () => {
  const actual = await vi.importActual<typeof import('./server')>('./server');
  return { ...actual, workActor: mock.actor, workDb: () => ({ rpc: mock.rpc, from: mock.from }) };
});
import { GET, POST } from '@/app/api/field/hourly/route';
const actor = '33333333-3333-4333-8333-333333333333', id = '11111111-1111-4111-8111-111111111111';
function request(body: unknown, origin = 'https://example.com') { return new Request('https://example.com/api/field/hourly', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) }); }
const submit = { action: 'submit', id, version: 1, actual_minutes: 240, note: '' };
beforeEach(() => { vi.resetAllMocks(); mock.actor.mockResolvedValue({ id: actor, admin: false, contractorId: id, contractorActive: true }); mock.rpc.mockResolvedValue({ data: { id, version: 2 }, error: null }); });
describe('hourly API trust boundaries', () => {
  it('derives actor ID from the session for submission', async () => { expect((await POST(request(submit))).status).toBe(200); expect(mock.rpc).toHaveBeenCalledWith('contractor_hourly_action', expect.objectContaining({ p_actor: actor, p_action: 'submit', p_version: 1 })); });
  it('rejects contractor approvals before calling the database', async () => { expect((await POST(request({ action: 'approve', id, version: 1, approved_minutes: 240, note: '' }))).status).toBe(403); expect(mock.rpc).not.toHaveBeenCalled(); });
  it('rejects cross-origin mutations', async () => { expect((await POST(request(submit, 'https://attacker.invalid'))).status).toBe(403); expect(mock.rpc).not.toHaveBeenCalled(); });
  it('rejects inactive contractors for reads and writes', async () => { mock.actor.mockResolvedValue({ id: actor, admin: false, contractorId: id, contractorActive: false }); expect((await POST(request(submit))).status).toBe(403); expect((await GET(new Request('https://example.com/api/field/hourly'))).status).toBe(403); expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled(); });
  it('rejects injected identity and rates', async () => { expect((await POST(request({ ...submit, actor: id, rate_cents: 90000 }))).status).toBe(400); expect(mock.rpc).not.toHaveBeenCalled(); });
  it('returns a conflict for stale approval without treating it as success', async () => { mock.rpc.mockResolvedValue({ data: { error: 'changed' }, error: null }); expect((await POST(request(submit))).status).toBe(409); });
  it('does not leak database error details', async () => { mock.rpc.mockResolvedValue({ error: { code: 'test', message: 'secret internal detail' }, data: null }); const response = await POST(request(submit)); expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret internal detail'); });
  it('denies contractor history requests before reading any data', async () => { const response = await GET(new Request(`https://example.com/api/field/hourly?id=${id}`)); expect(response.status).toBe(403); expect(mock.from).not.toHaveBeenCalled(); });
  it('allows administrators to read history', async () => {
    mock.actor.mockResolvedValue({ id: actor, admin: true });
    const events = [{ id, kind: 'edit', details: { before: { rate_cents: 7500 }, after: { rate_cents: 6000 } } }];
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id }, error: null }), order: vi.fn().mockResolvedValue({ data: events, error: null }) };
    mock.from.mockReturnValue(q);
    const response = await GET(new Request(`https://example.com/api/field/hourly?id=${id}`));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ events });
  });
});
