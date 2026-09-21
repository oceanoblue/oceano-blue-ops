import { beforeEach, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/portal/orders/[id]/reschedule/route';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAvailability } from './availability';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(),createAdminClient:vi.fn()}));
vi.mock('./availability',()=>({getAvailability:vi.fn()}));
vi.mock('@/lib/security/rate-limit',()=>({enforceRateLimit:vi.fn(async()=>null)}));
const id='00000000-0000-4000-8000-000000000001';
let user:any,order:any,settings:any,prior:any,rpc:any,filters:any[];
const previous=new Date(Date.now()+7*86400000).toISOString(),next=new Date(Date.now()+8*86400000).toISOString();
beforeEach(()=>{
  vi.resetAllMocks(); user={id:'user'}; order={id,status:'booked',scheduled_at:previous,photographer_id:'assigned',duration_minutes:90}; settings={client_rescheduling_enabled:true,client_reschedule_cutoff_hours:48,default_timezone:'UTC'};prior=null;filters=[];
  const from=(table:string)=>{const q:any={};q.select=()=>q;q.eq=(k:string,v:any)=>{filters.push([table,k,v]);return q;};q.in=q.eq;
    q.single=q.maybeSingle=async()=>({data:table==='orders'?order:table==='business_settings'?settings:prior,error:null});return q;};
  rpc=vi.fn(async()=>({data:next,error:null}));
  vi.mocked(createClient).mockResolvedValue({auth:{getUser:async()=>({data:{user}})},rpc:async()=>({data:['client'],error:null}),from} as any);
  vi.mocked(createAdminClient).mockReturnValue({from,rpc} as any);
  vi.mocked(getAvailability).mockResolvedValue({slots:[{iso:next,photographer_id:'assigned'}],duration:90,calendarDegraded:false});
});
const ctx={params:Promise.resolve({id})};
const request=(body:any={request_id:id,previous,scheduled_at:next})=>new Request('https://example.test/api/portal/orders/order/reschedule?date=2026-09-30',{method:'POST',body:JSON.stringify(body)});
it('uses the authenticated client identity and assigned photographer for availability and commit',async()=>{
  expect((await POST(request(),ctx)).status).toBe(200);
  expect(filters).toContainEqual(['orders','client_id',['client']]);
  expect(getAvailability).toHaveBeenCalledWith(expect.any(String),90,'assigned',{productIds:[],zip:undefined});
  expect(rpc).toHaveBeenCalledWith('commit_client_reschedule',expect.objectContaining({p_client_ids:['client'],p_photographer_id:'assigned',p_duration:90}));
});
it('requires login and ownership before reading availability',async()=>{
  user=null;expect((await GET(request(),ctx)).status).toBe(401);user={id:'user'};order=null;expect((await POST(request(),ctx)).status).toBe(404);expect(getAvailability).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
});
it('does not commit when the calendar is degraded or the chosen time was taken',async()=>{
  vi.mocked(getAvailability).mockResolvedValue({slots:[],calendarDegraded:true});expect((await POST(request(),ctx)).status).toBe(503);
  vi.mocked(getAvailability).mockResolvedValue({slots:[],calendarDegraded:false});expect((await POST(request(),ctx)).status).toBe(409);expect(rpc).not.toHaveBeenCalled();
});
it('rejects changes within cutoff and changes disabled by the office',async()=>{
  order.scheduled_at=new Date(Date.now()+3600000).toISOString();expect((await POST(request(),ctx)).status).toBe(409);
  settings.client_rescheduling_enabled=false;expect((await GET(request(),ctx)).status).toBe(409);expect(rpc).not.toHaveBeenCalled();
});
it('returns a successful prior commit without checking availability or sending again',async()=>{
  prior={order_id:id,scheduled_at:next,previous_scheduled_at:previous};settings.client_rescheduling_enabled=false;
  expect((await POST(request(),ctx)).status).toBe(200);expect(getAvailability).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
  prior.order_id='other';expect((await POST(request(),ctx)).status).toBe(409);
});
it('rejects malformed input and reports transactional conflicts',async()=>{
  expect((await POST(request({}),ctx)).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValue({error:{message:'order_changed'}});expect((await POST(request(),ctx)).status).toBe(409);
});
