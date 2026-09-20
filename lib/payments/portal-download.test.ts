import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/portal/zip/route';
import { createClient } from '@/lib/supabase/server';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
const download=vi.fn();
let user:any,clientIds:string[],orders:any[],photos:any[],orderError:any;
beforeEach(()=>{
  vi.clearAllMocks();user={id:'user'};clientIds=['own','teammate'];orderError=null;
  orders=[{id:'paid',listing_id:'listing',client_id:'own',total_cents:100,download_paid_at:'2026-09-20'},
    {id:'unpaid',listing_id:'listing',client_id:'own',total_cents:100,download_paid_at:null},
    {id:'foreign',listing_id:'listing',client_id:'other',total_cents:0,download_paid_at:null}];
  photos=orders.map(o=>({order_id:o.id,filename:`${o.id}.jpg`,bucket:'delivery',storage_path:`${o.id}.jpg`,kind:'delivered',is_selected:true}));
  download.mockResolvedValue({data:new Blob(['fixture'])});
  vi.mocked(createClient).mockResolvedValue({auth:{getUser:async()=>({data:{user}})},rpc:async()=>({data:clientIds}),
    from:(table:string)=>{
      let data=table==='orders'?orders:photos;
      const q:any={select:()=>q,order:()=>q,eq:(k:string,v:any)=>{data=data.filter(r=>r[k]===v);return q;},in:(k:string,v:any[])=>{data=data.filter(r=>v.includes(r[k]));return q;},
        then:(resolve:any)=>Promise.resolve({data,error:table==='orders'?orderError:null}).then(resolve)};
      return q;
    },storage:{from:()=>({download})}} as any);
});
const req=()=>new Request('https://example.test/api/portal/zip?listing_id=listing&paid=1');
it('includes only entitled files in a multi-order listing ZIP',async()=>{
  const response=await GET(req());expect(response.status).toBe(200);await response.arrayBuffer();
  expect(download.mock.calls).toEqual([['paid.jpg']]);
});
it('allows free orders and client-team files',async()=>{
  orders[1].total_cents=0;orders[1].client_id='teammate';
  const response=await GET(req());await response.arrayBuffer();
  expect(download.mock.calls).toEqual([['paid.jpg'],['unpaid.jpg']]);
});
it('rejects an all-unpaid listing before reading storage',async()=>{
  orders[0].download_paid_at=null;
  expect((await GET(req())).status).toBe(402);expect(download).not.toHaveBeenCalled();
});
it('does not interpret a failed payment query as free access',async()=>{
  orderError={message:'unavailable'};
  expect((await GET(req())).status).toBe(503);expect(download).not.toHaveBeenCalled();
});
it('rejects unauthenticated users',async()=>{user=null;expect((await GET(req())).status).toBe(401);});
it('rejects staff without a client identity even when RLS would allow staff reads',async()=>{clientIds=[];expect((await GET(req())).status).toBe(403);});
it('does not reveal another client listing',async()=>{orders=orders.filter(o=>o.client_id==='other');expect((await GET(req())).status).toBe(404);});
