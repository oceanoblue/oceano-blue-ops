import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),client:vi.fn(),configured:vi.fn(),run:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createAdminClient:mocks.admin,createClient:mocks.client}));
vi.mock('@/lib/ai',()=>({getProvider:()=>({id:'openai-gpt-image',isConfigured:mocks.configured})}));
vi.mock('./runner',()=>({runAiJob:mocks.run}));
import { POST } from '@/app/api/ai/process/route';
import { PUT as defaultsPut } from '@/app/api/enhance/defaults/route';
import { ARTIFACT_REPAIR, DEFAULT_FINISH_DEFAULTS } from './finishing';
const order='11111111-1111-4111-8111-111111111111',photo='22222222-2222-4222-8222-222222222222';
let written:any[];
beforeEach(()=>{
  written=[];mocks.configured.mockReturnValue(true);
  mocks.client.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'staff'}}})},rpc:async()=>({data:true})});
  mocks.admin.mockReturnValue({from:(table:string)=>{
    let insert:any=null;
    const q:any={select:()=>q,eq:()=>q,in:()=>q,update:()=>q,
      insert:(value:any)=>{insert=value;written.push({table,value});return q;},
      upsert:(value:any)=>{written.push({table,value});return q;},
      maybeSingle:async()=>({data:{finish_defaults:DEFAULT_FINISH_DEFAULTS}}),
      then:(resolve:any)=>Promise.resolve({data:insert?[{id:'job'}]:table==='photos'?[{id:photo,order_id:order,kind:'processed',filename:'accepted.jpg'}]:null,error:null}).then(resolve)};
    return q;
  }});
});
const request=(body:any)=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body)});
it('snapshots selected quality and style when enqueuing against the current version',async()=>{
  const res=await POST(request({order_id:order,job_type:'enhance_single',photo_ids:[photo],finish:{style:'editorial',scene:'interior',windows:'balanced',quality:'xhigh'}}));
  expect(res.status).toBe(200);
  const row=written.find(w=>w.table==='ai_jobs').value[0];
  expect(row.input_photo_ids).toEqual([photo]);
  expect(row.params.recipe).toMatchObject({version:2,model:'gpt-image-2.5-sunburst',source_photo_id:photo,finish:{style:'editorial',quality:'xhigh'}});
  expect(row.prompt).toContain('Editorial');
});
it('uses a limited refinement instruction instead of a second full finish',async()=>{
  await POST(request({order_id:order,job_type:'enhance_single',photo_ids:[photo],refinement:true,prompt_extra:'Lift the corner slightly'}));
  const recipe=written.find(w=>w.table==='ai_jobs').value[0].params.recipe;
  expect(recipe.refinement).toBe(true);
  expect(recipe.prompt).toContain('current finished photograph');
  expect(recipe.prompt).not.toContain('Substantially improve');
});
it('rejects invalid styles and unsigned requests without creating jobs',async()=>{
  expect((await POST(request({order_id:order,job_type:'enhance_single',finish:{style:'invented'}}))).status).toBe(400);
  mocks.client.mockResolvedValue({auth:{getUser:async()=>({data:{user:null}})}});
  expect((await POST(request({order_id:order,job_type:'enhance_single'}))).status).toBe(401);
  expect(written).toEqual([]);
});
it('checks model configuration before creating a paid job',async()=>{
  mocks.configured.mockReturnValue(false);
  expect((await POST(request({order_id:order,job_type:'enhance_single',photo_ids:[photo]}))).status).toBe(400);
  expect(written).toEqual([]);
});
it('saved defaults affect only the defaults row, never existing photos',async()=>{
  expect((await defaultsPut(request(DEFAULT_FINISH_DEFAULTS))).status).toBe(200);
  expect(written).toHaveLength(1);
  expect(written[0].table).toBe('oceano_enhance_settings');
});

it('snapshots the chosen model for a general artifact revision without reapplying the finish',async()=>{
  const result = await POST(request({order_id:order,job_type:'enhance_single',photo_ids:[photo],refinement:true,prompt_extra:ARTIFACT_REPAIR,finish:{model:'gpt-image-2.5-flare',quality:'xhigh',windows:'off'}}));
  expect(result.status).toBe(200);
  const row=written.find(w=>w.table==='ai_jobs').value[0];
  expect(row.params.recipe).toMatchObject({model:'gpt-image-2.5-flare',refinement:true,source_photo_id:photo,finish:{windows:'off',quality:'xhigh'}});
  expect(row.prompt).toContain('Apply ONLY');
  expect(row.prompt).not.toContain('Substantially improve');
});
it('rejects unsupported model IDs before creating a job',async()=>{
  expect((await POST(request({order_id:order,job_type:'enhance_single',finish:{model:'unrecognized-model'}}))).status).toBe(400);
  expect(written).toEqual([]);
});
