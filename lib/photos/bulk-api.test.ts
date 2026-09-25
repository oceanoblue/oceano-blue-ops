import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), from: vi.fn(), storage: vi.fn(), calls: [] as any[] }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.user }, rpc: m.rpc }),
  createAdminClient: () => ({ from: m.from, storage: { from: m.storage } }),
}));
import { POST } from '@/app/api/photos/bulk/route';
const order = '11111111-1111-4111-8111-111111111111';
const a = '22222222-2222-4222-8222-222222222222';
const b = '33333333-3333-4333-8333-333333333333';
const post = (body: unknown) => POST(new Request('https://test/api/photos/bulk', { method: 'POST', body: JSON.stringify(body) }));
const remove = vi.fn(async () => ({ error: null }));
let rows: any[];
beforeEach(() => {
  vi.clearAllMocks();
  m.calls = [];
  rows = [{ id: a, filename: 'a.jpg', bucket: 'processed', storage_path: 'o/a.jpg' }];
  m.user.mockResolvedValue({ data: { user: { id: 'staff' } } });
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.storage.mockReturnValue({ remove });
  m.from.mockImplementation((table: string) => {
    const op: any = { table, filters: [] as any[] };
    m.calls.push(op);
    const q: any = {
      select: () => { op.kind = 'select'; return q; },
      update: (v: any) => { op.kind = 'update'; op.value = v; return q; },
      delete: () => { op.kind = 'delete'; return q; },
      insert: async (v: any) => { op.kind = 'insert'; op.value = v; return { error: null }; },
      eq: (c: string, v: any) => { op.filters.push(['eq', c, v]); return q; },
      in: (c: string, v: any) => { op.filters.push(['in', c, v]); return q; },
      then: (res: any) => res(op.kind === 'select' ? { data: rows, error: null } : { error: null }),
    };
    return q;
  });
});
it('requires staff', async () => {
  m.rpc.mockResolvedValue({ data: false, error: null });
  expect((await post({ order_id: order, photo_ids: [a], action: 'remove' })).status).toBe(403);
  expect(m.from).not.toHaveBeenCalled();
});
it('only touches finished photos on the given order', async () => {
  expect((await post({ order_id: order, photo_ids: [a, b], action: 'remove' })).status).toBe(200);
  const load = m.calls[0];
  expect(load.filters).toContainEqual(['eq', 'order_id', order]);
  expect(load.filters).toContainEqual(['in', 'kind', ['processed', 'delivered']]);
  const update = m.calls[1];
  expect(update.value).toEqual({ is_selected: false });
  expect(update.filters).toContainEqual(['in', 'id', [a]]);
});
it('restores archived photos to undecided', async () => {
  await post({ order_id: order, photo_ids: [a], action: 'restore' });
  expect(m.calls[1].value).toEqual({ is_selected: null });
});
it('deletes rows, detaches newer versions, and removes the files', async () => {
  const r = await post({ order_id: order, photo_ids: [a], action: 'delete' });
  expect(r.status).toBe(200);
  expect(m.calls[1]).toMatchObject({ kind: 'update', value: { parent_photo_id: null } });
  expect(m.calls[2]).toMatchObject({ kind: 'delete' });
  expect(m.calls[2].filters).toContainEqual(['in', 'id', [a]]);
  expect(m.storage).toHaveBeenCalledWith('processed');
  expect(remove).toHaveBeenCalledWith(['o/a.jpg']);
  expect(m.calls[3]).toMatchObject({ table: 'activity_log', kind: 'insert' });
});
it('404s when nothing matches (e.g. RAW originals or another order)', async () => {
  rows = [];
  expect((await post({ order_id: order, photo_ids: [a], action: 'delete' })).status).toBe(404);
  expect(remove).not.toHaveBeenCalled();
});
