import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({thumbnail:null as any,update:vi.fn(),publish:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({
 createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'staff'}}})},rpc:async()=>({data:true})}),
 createAdminClient:()=>({from:(table:string)=>{
  const data=table==='podcast_episodes'?{id:'11111111-1111-4111-8111-111111111111',job_id:'job',status:'needs_review',podcast_shows:{metadata:{thumbnail_required:true}}}:
   table==='approvals'?{id:'approval',status:'pending'}:table==='external_links'?{url:'https://youtu.be/abcdefghijk',external_id:'abcdefghijk',label:'YouTube (unlisted)'}:m.thumbnail;
  const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data}),update:m.update};return q;
 }})
}));
vi.mock('@/lib/podcasts/youtube',()=>({publishYoutubeDraft:m.publish}));
vi.mock('@/lib/integrations/transistor',()=>({publishTransistorEpisode:vi.fn()}));
import {POST} from '@/app/api/automations/podcast/approve/route';
beforeEach(()=>{vi.clearAllMocks();m.thumbnail=null;});
it.each([null,{status:'generating'},{status:'review',storage_path:'draft',youtube_id:'abcdefghijk'},{status:'ready',storage_path:'path',youtube_id:'wrong-video'}])('blocks approval and publishing when thumbnail is incomplete or for another video: %j',async(thumbnail)=>{
 m.thumbnail=thumbnail;
 const response=await POST(new Request('https://example.test/api/automations/podcast/approve',{method:'POST',body:JSON.stringify({episode_id:'11111111-1111-4111-8111-111111111111',decision:'approve'})}));
 expect(response.status).toBe(409);expect((await response.json()).error).toContain('thumbnail');expect(m.update).not.toHaveBeenCalled();expect(m.publish).not.toHaveBeenCalled();
});
