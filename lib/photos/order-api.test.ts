import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({user:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase/server', () => ({
  createClient:async () => ({auth:{getUser:m.user},rpc:m.rpc}),
  createAdminClient:() => ({from:m.from}),
}));
import { POST } from '@/app/api/photos/order/route';
const order = '11111111-1111-4111-8111-111111111111';
const post = (body: unknown = {order_id:order,mode:'filename'}) => POST(new Request('https://test/api/photos/order',{method:'POST',body:JSON.stringify(body)}));
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({data:{user:{id:'staff'}}});
  m.rpc.mockImplementation(async (name:string) => ({data:name==='is_team_member' ? true:null,error:null}));
  const q:any = {select:()=>q,eq:async()=>({data:[{id:'10',filename:'DSC10.jpg',sort_order:null,kind:'processed'},{id:'2',filename:'DSC2.jpg',sort_order:null,kind:'processed'}],error:null})};
  m.from.mockReturnValue(q);
});
it('requires staff before reading or sorting a gallery', async () => {
  m.user.mockResolvedValue({data:{user:null}});
  expect((await post()).status).toBe(401);
  m.user.mockResolvedValue({data:{user:{id:'client'}}});
  m.rpc.mockResolvedValue({data:false,error:null});
  expect((await post()).status).toBe(403);
  expect(m.from).not.toHaveBeenCalled();
});
it('saves a naturally sorted complete snapshot through the atomic RPC', async () => {
  expect((await post()).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith('set_gallery_photo_order',{p_order:order,p_ids:['2','10'],p_expected:{'10':null,'2':null}});
});
it('rejects unsupported sort modes before loading photos', async () => {
  expect((await post({order_id:order,mode:'room'})).status).toBe(400);
  expect(m.from).not.toHaveBeenCalled();
});
it('reports a concurrent gallery change rather than claiming success', async () => {
  m.rpc.mockImplementation(async (name:string) => name==='is_team_member' ? {data:true,error:null}:{error:{message:'gallery_changed'}});
  const response=await post();
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('Refresh');
});
