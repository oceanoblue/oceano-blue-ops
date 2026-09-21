import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks = vi.hoisted(()=>({admin:vi.fn(), auth:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createAdminClient:mocks.admin,createClient:mocks.auth}));
import { POST as save } from '@/app/api/photos/adjust/route';
import { POST as preview } from '@/app/api/enhance/preview/route';
const photoId='11111111-1111-4111-8111-111111111111';
let stored: Buffer;
let uploaded: Buffer;
let inserted: any;
let paths: string[];
beforeEach(async()=>{
  paths=[]; inserted=null;
  stored=await sharp({create:{width:128,height:128,channels:3,background:{r:205,g:170,b:130}}}).png().toBuffer();
  const src={id:photoId,order_id:'order',bucket:'processed-photos',storage_path:'accepted-ai.png',filename:'accepted-ai.png',parent_photo_id:'raw-original'};
  mocks.auth.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'staff'}}})},rpc:async()=>({data:true})});
  mocks.admin.mockReturnValue({from:()=>{
    const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:src}),insert:(value:any)=>{inserted=value;return q;},single:async()=>({data:{id:'new',filename:'new.jpg'}})};return q;
  },storage:{from:()=>({download:async(path:string)=>{paths.push(path);return {data:new Blob([new Uint8Array(stored)])};},upload:async(_path:string,bytes:Buffer)=>{uploaded=bytes;return {};}})}});
});
it('preview and saved adjustment both use the selected AI finish, with child lineage and the complete options',async()=>{
  const options={exposure:0.15,temp:0,sharpening:0};
  const request=()=>new Request('https://example.test',{method:'POST',body:JSON.stringify({photo_id:photoId,options})});
  expect((await preview(request())).status).toBe(200);
  expect((await save(request())).status).toBe(200);
  expect(paths).toEqual(['accepted-ai.png','accepted-ai.png']);
  expect(inserted.parent_photo_id).toBe(photoId);
  expect(inserted.ai_recipe).toMatchObject({source_photo_id:photoId,options});
  expect((await sharp(uploaded).metadata()).width).toBe(128);
});
it('does not change the warm material color just because an adjustment is saved',async()=>{
  const response=await save(new Request('https://example.test',{method:'POST',body:JSON.stringify({photo_id:photoId,options:{sharpening:0}})}));
  expect(response.status).toBe(200);
  const means=(await sharp(uploaded).stats()).channels.map(c=>c.mean);
  expect(Math.abs(means[0]-205)).toBeLessThan(3);
  expect(Math.abs(means[2]-130)).toBeLessThan(3);
});
it('rejects unauthenticated adjustments before reading images',async()=>{
  mocks.auth.mockResolvedValue({auth:{getUser:async()=>({data:{user:null}})}});
  expect((await save(new Request('https://example.test',{method:'POST'}))).status).toBe(401);
  expect(paths).toEqual([]);
});
