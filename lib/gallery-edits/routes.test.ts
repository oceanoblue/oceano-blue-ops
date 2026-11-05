import { beforeEach,expect,it,vi } from 'vitest';
vi.mock('server-only',()=>({}));
const h=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),storage:vi.fn(),access:vi.fn(),limit:vi.fn(),run:vi.fn(),after:vi.fn(),staff:vi.fn()}));
vi.mock('@/lib/gallery-edits/server',()=>({
 editDb:()=>({rpc:h.rpc,from:h.from,storage:{from:h.storage}}),editAccess:h.access,limitEdits:h.limit,providerAvailable:()=>true,
 privateHeaders:{'Cache-Control':'private, no-store'},editJson:(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}}),readSmallJson:(r:Request)=>r.json(),
}));
vi.mock('@/lib/gallery-edits/runner',()=>({runGalleryEdit:h.run}));
vi.mock('@/lib/auth/require-team-member',()=>({requireTeamMember:h.staff}));
vi.mock('next/server',()=>({after:h.after}));
import {GET,POST} from '@/app/api/delivery/[token]/edits/route';
import {GET as download} from '@/app/api/delivery/[token]/edits/[id]/download/route';
import {PATCH as review} from '@/app/api/gallery-edits/[id]/route';
const input={id:'10000000-0000-4000-8000-000000000001',photo_id:'20000000-0000-4000-8000-000000000001',operation:'declutter',options:{area:{x:0.2,y:0.2,width:0.2,height:0.2}}};
const ctx={params:Promise.resolve({token:'valid'})};
const request=(body:unknown=input)=>new Request('https://example.test/api/delivery/valid/edits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function query(result:unknown){const q:any={then:(resolve:any)=>Promise.resolve(result).then(resolve)};for(const method of ['select','eq','order','limit','maybeSingle','single'])q[method]=vi.fn(()=>q);return q;}
beforeEach(()=>{
 vi.clearAllMocks();h.access.mockResolvedValue({error:null,link:{id:'link',order_id:'order'}});h.limit.mockResolvedValue(null);h.staff.mockResolvedValue({error:null,user:{id:'staff'}});
 h.rpc.mockResolvedValue({data:{id:input.id,status:'queued',replay:false},error:null});
});
it('rejects free-form prompts before reserving or scheduling any generation',async()=>{
 const response=await POST(request({...input,prompt:'other image'}),ctx);
 expect(response.status).toBe(400);expect(h.rpc).not.toHaveBeenCalled();expect(h.after).not.toHaveBeenCalled();
});
it('fails closed on authorization/payment or limiter failures',async()=>{
 h.limit.mockResolvedValue(new Response('Unavailable',{status:503}));expect((await POST(request(),ctx)).status).toBe(503);
 expect(h.access).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalled();
 h.limit.mockResolvedValue(null);h.access.mockResolvedValue({error:new Response('payment',{status:402})});
 expect((await POST(request(),ctx)).status).toBe(402);expect(h.rpc).not.toHaveBeenCalled();
});
it('reserves canonical options before background generation and returns no internal provider data',async()=>{
 const response=await POST(request(),ctx);expect(response.status).toBe(202);
 expect(h.rpc).toHaveBeenCalledWith('reserve_gallery_edit',{p_token:'valid',p_id:input.id,p_photo_id:input.photo_id,p_operation:'declutter',p_options:input.options});
 expect(await response.json()).toEqual({id:input.id,status:'queued'});
 expect(h.after).toHaveBeenCalledOnce();expect(h.run).not.toHaveBeenCalled();
 await h.after.mock.calls[0][0]();expect(h.run).toHaveBeenCalledWith(input.id);
});
it('replays completed requests without new work, and hides database internals on failure',async()=>{
 h.rpc.mockResolvedValueOnce({data:{id:input.id,status:'review',replay:true}});
 expect((await POST(request(),ctx)).status).toBe(200);expect(h.after).not.toHaveBeenCalled();
 h.rpc.mockResolvedValueOnce({error:{message:'sensitive storage path and prompt'}});
 const response=await POST(request(),ctx);expect(response.status).toBe(503);expect(await response.text()).not.toContain('sensitive');expect(h.after).not.toHaveBeenCalled();
});
it('lists public fields scoped to the order shared by gallery links',async()=>{
 const queries:Record<string,any>={gallery_edit_accounts:query({data:{remaining:3}}),gallery_edits:query({data:[{id:input.id,status:'review'}]}),gallery_edit_settings:query({data:{enabled:true}})};
 h.from.mockImplementation(table=>queries[table]);
 const response=await GET(new Request('https://example.test'),ctx);
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
 expect(queries.gallery_edits.eq).toHaveBeenCalledWith('order_id','order');
 expect(queries.gallery_edits.select).toHaveBeenCalledWith('id, photo_id, operation, credits, status, created_at');
 expect((await response.json()).remaining).toBe(3);
});
it('never downloads another order’s result or a result awaiting review',async()=>{
 const q=query({data:null});h.from.mockReturnValue(q);
 const response=await download(new Request('https://example.test'),{params:Promise.resolve({token:'valid',id:input.id})});
 expect(response.status).toBe(404);expect(q.eq).toHaveBeenCalledWith('order_id','order');expect(q.eq).toHaveBeenCalledWith('status','approved');expect(h.storage).not.toHaveBeenCalled();
});
it('requires staff and explicit review confirmation to release images',async()=>{
 h.staff.mockResolvedValueOnce({error:new Response('forbidden',{status:403})});
 expect((await review(request({status:'approved',review_confirmed:true}),{params:Promise.resolve({id:input.id})})).status).toBe(403);
 expect(h.rpc).not.toHaveBeenCalled();
 expect((await review(request({status:'approved',review_confirmed:false}),{params:Promise.resolve({id:input.id})})).status).toBe(400);
 expect(h.rpc).not.toHaveBeenCalled();
 expect((await review(request({status:'approved',review_confirmed:true}),{params:Promise.resolve({id:input.id})})).status).toBe(200);
 expect(h.rpc).toHaveBeenCalledWith('settle_gallery_edit',{p_id:input.id,p_status:'approved',p_actor:'staff'});
});
