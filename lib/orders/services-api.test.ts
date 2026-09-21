import { beforeEach, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { PATCH } from '@/app/api/orders/[id]/services/route';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createClient } from '@/lib/supabase/server';
vi.mock('@/lib/auth/require-team-member', () => ({ requireTeamMember: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
const rpc = vi.fn();
const id='11111111-1111-4111-8111-111111111111';
const body = { expected_updated_at:'2026-09-21T12:00:00Z',expected_sqft:null,sqft:null,adjustment_cents:0,items:[{product_id:null,description:'Photography',quantity:1,unit_price_cents:22500}] };
function save(value: unknown = body) {
  return PATCH(new Request('https://example.test', {method:'PATCH',body:JSON.stringify(value)}), {params:Promise.resolve({id})});
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeamMember).mockResolvedValue({error:null,user:{id:'staff'} as any});
  vi.mocked(createClient).mockResolvedValue({rpc} as any);
  rpc.mockResolvedValue({data:{total_cents:22500},error:null});
});
it('blocks non-staff without reaching the mutation', async () => {
  vi.mocked(requireTeamMember).mockResolvedValue({error:NextResponse.json({error:'forbidden'},{status:403}),user:null});
  expect((await save()).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
});
it('persists the validated invoice and its version through the authenticated client', async () => {
  expect((await save()).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('edit_order_services',expect.objectContaining({p_order_id:id,p_items:body.items,p_expected_updated_at:body.expected_updated_at}));
});
it('rejects malformed prices without a write', async () => {
  expect((await save({...body,items:[{...body.items[0],unit_price_cents:225.5}]})).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it('returns actionable conflict messages', async () => {
  rpc.mockResolvedValue({error:{message:'order_changed'}});
  const response=await save(); expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('Refresh');
});
