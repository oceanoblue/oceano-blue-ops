import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/orders/[id]/deliverables/route';
import { PATCH, DELETE } from '@/app/api/deliverables/[id]/route';
import { createClient, createAdminClient } from '@/lib/supabase/server';
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
const insert = vi.fn(), update = vi.fn(), remove = vi.fn();
let user: { id: string } | null, team: boolean;
beforeEach(() => {
  vi.clearAllMocks(); user = { id: 'staff' }; team = true;
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } } as any);
  vi.mocked(createAdminClient).mockReturnValue({
    from: (table: string) => {
      const q: any = {};
      for (const method of ['select', 'eq', 'delete']) q[method] = () => q;
      q.insert = (row: any) => { insert(row); return q; };
      q.update = (row: any) => { update(row); return q; };
      q.single = q.maybeSingle = async () => ({ data: table === 'team_members' ? (team ? user : null) : table === 'orders' ? { id: 'order', listing_id: 'listing' } : { id: 'media', bucket: 'deliverables', storage_path: 'listing/plan.jpg' }, error: null });
      q.then = (resolve: any) => Promise.resolve({ error: null }).then(resolve);
      return q;
    },
    storage: { from: () => ({ remove }) },
  } as any);
});
const params = { params: Promise.resolve({ id: 'order' }) };
const post = (body: unknown) => POST(new Request('https://ops.test/api/orders/order/deliverables', { method: 'POST', body: JSON.stringify(body) }), params);
const tour = { source: 'url', kind: 'tour_360', external_url: 'https://www.zillow.com/view-imx/test?setAttribution=mls&wl=true&initialViewType=pano' };
it('preserves the complete Zillow tour URL without requiring a property website', async () => {
  expect((await post(tour)).status).toBe(200);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ ...tour, listing_id: 'listing', order_id: 'order', is_published: true }));
});
it.each(['application/pdf', 'image/jpeg'])('adds multiple %s floor plans to the same order', async mime => {
  for (const floor of ['first', 'second']) {
    expect((await post({ kind: 'floor_plan', source: 'file', storage_path: `listing/${floor}`, filename: floor, mime_type: mime })).status).toBe(200);
  }
  expect(insert).toHaveBeenCalledTimes(2);
});
it.each(['not a URL', 'javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/plan.pdf'])('rejects unsafe media URL %s', async external_url => {
  expect((await post({ ...tour, external_url })).status).toBe(400); expect(insert).not.toHaveBeenCalled();
});
it.each(['other-listing/plan.jpg', 'listing/../other/plan.jpg'])('rejects a file outside its listing: %s', async storage_path => {
  expect((await post({ kind: 'floor_plan', source: 'file', storage_path, mime_type: 'image/jpeg' })).status).toBe(400);
  expect(insert).not.toHaveBeenCalled();
});
it('rejects unsupported floor-plan files and malformed JSON', async () => {
  expect((await post({ kind: 'floor_plan', source: 'file', storage_path: 'listing/plan.svg', mime_type: 'image/svg+xml' })).status).toBe(400);
  expect((await POST(new Request('https://ops.test', { method: 'POST', body: '{' }), params)).status).toBe(400);
});
it.each([401, 403])('denies create, publish and delete without staff access (%s)', async status => {
  if (status === 401) user = null; else team = false;
  expect((await post(tour)).status).toBe(status);
  expect((await PATCH(new Request('https://ops.test', { method: 'PATCH', body: '{"is_published":true}' }), params)).status).toBe(status);
  expect((await DELETE(new Request('https://ops.test'), params)).status).toBe(status);
  expect(insert).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
});
