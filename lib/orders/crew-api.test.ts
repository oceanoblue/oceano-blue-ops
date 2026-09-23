import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),rpc:vi.fn(),read:vi.fn(),review:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:m.user},rpc:m.rpc}),createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({single:m.read})})})})}));
vi.mock('@/lib/booking/crew-review',()=>({reviewCrew:m.review}));
import {POST} from '@/app/api/orders/[id]/crew/route';
const photo='11111111-1111-4111-8111-111111111111',video='22222222-2222-4222-8222-222222222222',stamp='2026-09-23T10:00:00Z';
const order={scheduled_at:'2026-09-30T19:30:00Z',duration_minutes:120,updated_at:stamp,photographer_id:photo,videographer_id:video,assignment_round:3};
const body={action:'save',updated_at:stamp,photographer_id:photo,videographer_id:video,photo_offset:0,photo_duration:60,video_offset:60,video_duration:60};
const post=(b:object=body)=>POST(new Request('https://example.test/api/orders/order/crew',{method:'POST',body:JSON.stringify(b)}),{params:Promise.resolve({id:'order'})});
beforeEach(()=>{vi.resetAllMocks();m.user.mockResolvedValue({data:{user:{id:'staff'}}});m.rpc.mockResolvedValue({data:true});m.read.mockResolvedValue({data:order});m.review.mockResolvedValue([]);});
it('requires an authenticated staff caller',async()=>{
 m.user.mockResolvedValue({data:{user:null}});expect((await post()).status).toBe(401);expect(m.read).not.toHaveBeenCalled();
 m.user.mockResolvedValue({data:{user:{id:'client'}}});m.rpc.mockResolvedValue({data:false});expect((await post()).status).toBe(403);expect(m.read).not.toHaveBeenCalled();
});
it('reviews each person’s actual visit and atomically saves the split',async()=>{
 expect((await post()).status).toBe(200);
 expect(m.review.mock.calls).toEqual([['2026-09-30T19:30:00.000Z',60,[photo],'order'],['2026-09-30T20:30:00.000Z',60,[video],'order']]);
 expect(m.rpc).toHaveBeenCalledWith('set_order_crew',expect.objectContaining({p_photo_offset:0,p_photo_duration:60,p_video_offset:60,p_video_duration:60,p_allow_overlap:false}));
});
it('requires explicit warning acknowledgement and rejects stale edits',async()=>{
 m.review.mockResolvedValue(['Shared calendar needs review']);expect((await post()).status).toBe(409);expect(m.rpc).toHaveBeenCalledTimes(1);
 expect((await post({...body,acknowledge_warnings:true})).status).toBe(200);
 expect(m.rpc).toHaveBeenCalledWith('set_order_crew',expect.objectContaining({p_allow_overlap:true}));
 m.rpc.mockClear();expect((await post({...body,updated_at:'old'})).status).toBe(409);expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('rejects a role extending past the client appointment even with acknowledged warnings',async()=>{
 expect((await post({...body,video_duration:90,acknowledge_warnings:true})).status).toBe(400);expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('returns an availability failure without mutating the assignment',async()=>{
 m.review.mockRejectedValue(new Error('Calendar check failed'));expect((await post()).status).toBe(503);expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('does not resend a renewal after a successful retry',async()=>{
 m.read.mockResolvedValue({data:{...order,assignment_round:4,assignment_state:'awaiting_response',auto_dispatch:false}});
 expect((await post({...body,action:'renew',round:3})).status).toBe(200);expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.review).not.toHaveBeenCalled();
});

it('clears unused role durations so hidden fields cannot constrain a later client reschedule',async()=>{
 expect((await post({...body,videographer_id:null})).status).toBe(200);
 expect(m.rpc).toHaveBeenCalledWith('set_order_crew',expect.objectContaining({p_videographer:null,p_video_offset:0,p_video_duration:null}));
});
