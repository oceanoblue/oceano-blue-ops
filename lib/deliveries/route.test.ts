import {beforeEach,expect,it,vi} from 'vitest';
import {NextResponse} from 'next/server';
import {GET,POST} from '@/app/api/delivery-link/route';
import {requireTeamMember} from '@/lib/auth/require-team-member';
import {deliveryContext} from './context';
import {createAdminClient} from '@/lib/supabase/server';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/auth/require-team-member',()=>({requireTeamMember:vi.fn()}));
vi.mock('./context',()=>({deliveryContext:vi.fn()}));
vi.mock('@/lib/security/rate-limit',()=>({enforceRateLimit:vi.fn(async()=>null)}));
vi.mock('@/lib/supabase/server',()=>({createAdminClient:vi.fn()}));
const id='11111111-1111-4111-8111-111111111111';
const context:any={order:{id,order_number:1},client:{email:'client@example.test',full_name:'Real Client'},listing:{address_line1:'Client address'},photoCount:1,mediaCount:0,phone:'+12025550123',channels:{email:true,sms:true},teammates:[{email:'teammate@example.test',full_name:'Teammate'}],paywall:{active:false},appUrl:'https://example.test'};
const req=(body:any)=>new Request('https://example.test/api/delivery-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.resetAllMocks();vi.mocked(requireTeamMember).mockResolvedValue({error:null,user:{id} as any});
 vi.mocked(deliveryContext).mockResolvedValue(context);
 const chain:any={update:()=>chain,eq:()=>chain,select:()=>chain,maybeSingle:async()=>({data:null,error:null})};
 vi.mocked(createAdminClient).mockReturnValue({rpc,from:()=>chain} as any);
 rpc.mockResolvedValue({data:{id,status:'sent'},error:null});
});
it('blocks unauthenticated or non-staff send and history requests before accessing client data',async()=>{
 vi.mocked(requireTeamMember).mockResolvedValue({error:NextResponse.json({error:'forbidden'},{status:403}),user:null});
 expect((await POST(req({order_id:id,action:'deliver'}))).status).toBe(403);
 expect((await GET(new Request(`https://example.test/api/delivery-link?order_id=${id}`))).status).toBe(403);
 expect(deliveryContext).not.toHaveBeenCalled();expect(createAdminClient).not.toHaveBeenCalled();
});
it('test mode only targets explicit test contacts, even when team delivery is selected',async()=>{
 const response=await POST(req({order_id:id,request_id:id,action:'test',email:true,sms:true,include_team:true,test_email:'me@example.test',test_phone:'2025550999'}));
 expect(response.status).toBe(200);
 const payload=rpc.mock.calls[0][1];expect(payload.p_test).toBe(true);
 expect(payload.p_recipients.map((r:any)=>r.to)).toEqual(['me@example.test','+12025550999']);
});
it('test mode never falls back to a real client when test contacts are missing',async()=>{
 expect((await POST(req({order_id:id,request_id:id,action:'test',email:true}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
it('prevents live delivery of an empty gallery but allows a sample test',async()=>{
 vi.mocked(deliveryContext).mockResolvedValue({...context,photoCount:0,mediaCount:0});
 expect((await POST(req({order_id:id,request_id:id,action:'deliver'}))).status).toBe(400);
 expect(rpc).not.toHaveBeenCalled();
 expect((await POST(req({order_id:id,request_id:id,action:'test',test_email:'me@example.test'}))).status).toBe(200);
});
it('default link preparation does not claim a dispatch or send notifications',async()=>{
 rpc.mockResolvedValue({data:{id,token:'preview'},error:null});
 const response=await POST(req({order_id:id}));expect(response.status).toBe(200);
 expect(rpc).toHaveBeenCalledTimes(1);expect(rpc.mock.calls[0][0]).toBe('prepare_gallery_link');
});
