import {beforeEach,expect,it,vi} from 'vitest';
import {PUT} from '@/app/api/scheduling/hours/route';
import {POST as block,DELETE as unblock} from '@/app/api/scheduling/time-off/route';
import {POST as profile} from '@/app/api/scheduling/profiles/route';
const {state,rpc,writes,filters}=vi.hoisted(()=>({state:{user:null as any,staff:null as any},rpc:vi.fn(),writes:vi.fn(),filters:[] as any[]}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})}}),createAdminClient:()=>({rpc,from:(table:string)=>{const q:any={then:(r:any)=>Promise.resolve({data:state.staff,error:null}).then(r)};q.eq=(key:string,val:any)=>{filters.push([table,key,val]);return q;};for(const k of ['select','single','or'])q[k]=()=>q;for(const k of ['insert','delete','upsert'])q[k]=(...args:any[])=>{writes(table,k,...args);return q;};return q;}})}));
const own='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const req=(body:any)=>new Request('https://example.test/api/scheduling/hours',{method:'PUT',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();filters.length=0;state.user={id:own};state.staff={id:own,role:'photographer',is_active:true};rpc.mockResolvedValue({error:null});});
it('rejects cross-photographer hours and time-off writes',async()=>{
 expect((await PUT(req({team_member_id:other,rows:[]}))).status).toBe(403);
 expect((await block(req({team_member_id:other,starts_at:'2026-10-01T12:00:00Z',ends_at:'2026-10-01T13:00:00Z',reason:''}))).status).toBe(403);
 expect(rpc).not.toHaveBeenCalled();expect(writes).not.toHaveBeenCalled();
});
it('allows own valid hours and restricts deleting blocks to the signed-in member',async()=>{
 expect((await PUT(req({team_member_id:own,rows:[]}))).status).toBe(200);
 expect(rpc).toHaveBeenCalledWith('replace_photographer_hours',{p_member:own,p_rows:[]});
 await unblock(new Request(`https://example.test/api/scheduling/time-off?id=${other}`));
 expect(filters).toContainEqual(['schedule_blocks','team_member_id',own]);
});
it('denies contractor routing changes and unsigned requests',async()=>{
 expect((await profile(req({}))).status).toBe(403);state.user=null;
 expect((await PUT(req({team_member_id:own,rows:[]}))).status).toBe(401);expect(writes).not.toHaveBeenCalled();
});
it('rejects invalid hours before replacing the previous schedule',async()=>{
 expect((await PUT(req({team_member_id:own,rows:[{day_of_week:1,start_local:'17:00',end_local:'09:00',timezone:'America/New_York'}]}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
