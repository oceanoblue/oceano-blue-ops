import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/orders/[id]/sync-calendar/route';
import { createClient } from '@/lib/supabase/server';
import { syncShootCalendar } from '@/lib/google-calendar/sync-shoot';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/google-calendar/sync-shoot',()=>({syncShootCalendar:vi.fn()}));
const getUser=vi.fn(),rpc=vi.fn();
const call=()=>POST(new Request('https://example.test',{method:'POST'}),{params:Promise.resolve({id:'order'})});
beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(createClient).mockResolvedValue({auth:{getUser},rpc} as any);
  getUser.mockResolvedValue({data:{user:{id:'staff'}}});rpc.mockResolvedValue({data:true});
});
it('denies unauthenticated and client calendar writes',async()=>{
  getUser.mockResolvedValue({data:{user:null}});expect((await call()).status).toBe(401);
  getUser.mockResolvedValue({data:{user:{id:'client'}}});rpc.mockResolvedValue({data:false});
  expect((await call()).status).toBe(403);expect(syncShootCalendar).not.toHaveBeenCalled();
});
it('requires a confirmed calendar sync before returning success',async()=>{
  expect((await call()).status).toBe(200);expect(syncShootCalendar).toHaveBeenCalledWith('order',{strict:true});
});
it('returns a retryable failure when the calendar rejects the time update',async()=>{
  vi.mocked(syncShootCalendar).mockRejectedValue(new Error('calendar_update_failed'));
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect((await call()).status).toBe(502);log.mockRestore();
});
