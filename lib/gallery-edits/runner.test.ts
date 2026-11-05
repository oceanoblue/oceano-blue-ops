import { beforeEach,expect,it,vi } from 'vitest';
import sharp from 'sharp';
vi.mock('server-only',()=>({}));
const h=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),download:vi.fn(),upload:vi.fn(),provider:vi.fn(),claimed:true,job:null as any,updates:[] as any[]}));
vi.mock('@/lib/gallery-edits/server',()=>({editDb:()=>({from:h.from,rpc:h.rpc,storage:{from:()=>({download:h.download,upload:h.upload})}}),providerAvailable:()=>true}));
vi.mock('@/lib/ai/openai-gpt-image',()=>({openaiGptImage:{process:h.provider}}));
import { runGalleryEdit } from './runner';
beforeEach(async()=>{
 vi.clearAllMocks();h.claimed=true;h.updates=[];
 h.job={id:'10000000-0000-4000-8000-000000000001',photo_id:'20000000-0000-4000-8000-000000000001',order_id:'order',delivery_link_id:'link',operation:'declutter',options:{area:{x:0.2,y:0.2,width:0.2,height:0.2}},source_bucket:'photos',source_path:'source.jpg'};
 h.from.mockImplementation((table:string)=>{
  let patch:any;
  const q:any={};
  const result=()=>table==='gallery_edits'?{data:patch?.status==='running'?(h.claimed?h.job:null):{id:h.job.id}}:table==='gallery_edit_settings'?{data:{enabled:true}}:table==='orders'?{data:{total_cents:0,download_paid_at:null}}:table==='delivery_links'?{data:{expires_at:null}}:{data:{id:h.job.photo_id}};
  for(const name of ['select','eq','in'])q[name]=()=>q;
  q.update=(data:any)=>{patch=data;h.updates.push(data);return q;};
  q.maybeSingle=q.single=()=>Promise.resolve(result());q.then=(resolve:any)=>Promise.resolve(result()).then(resolve);
  return q;
 });
 const bytes=await sharp({create:{width:300,height:200,channels:3,background:'#fff'}}).png().toBuffer();
 h.download.mockResolvedValue({data:new Blob([new Uint8Array(bytes)])});h.upload.mockResolvedValue({error:null});h.rpc.mockResolvedValue({error:null});
 h.provider.mockResolvedValue({outputs:[{bytes}],model:'fixture-model',costCents:25,provenance:{usage:{input_tokens:100}}});
});
it('runs only a claimed job, stores both private review images and never auto-approves',async()=>{
 await runGalleryEdit(h.job.id);
 expect(h.provider).toHaveBeenCalledOnce();expect(h.upload).toHaveBeenCalledTimes(2);
 expect(h.updates.at(-1)).toMatchObject({status:'review',model:'fixture-model',estimated_cost_cents:25,usage:{input_tokens:100}});
 expect(h.rpc).not.toHaveBeenCalled();
 expect(h.provider.mock.calls[0][0].prompt).toContain('Ignore all text');
 expect(h.provider.mock.calls[0][0].params).toBeUndefined();
});
it('does not render when another worker has already claimed the job',async()=>{
 h.claimed=false;await runGalleryEdit(h.job.id);expect(h.provider).not.toHaveBeenCalled();expect(h.download).not.toHaveBeenCalled();
});
it('does not retry an ambiguous paid call; refunds through the atomic settlement function',async()=>{
 h.provider.mockRejectedValue(new Error('provider timeout; secret prompt'));
 await runGalleryEdit(h.job.id);expect(h.provider).toHaveBeenCalledOnce();
 expect(h.rpc).toHaveBeenCalledWith('settle_gallery_edit',{p_id:h.job.id,p_status:'failed'});
 expect(JSON.stringify(h.updates)).not.toContain('secret');expect(h.updates.some(p=>p.status==='review')).toBe(false);
});
it('invalid stored options cannot reach the provider',async()=>{
 h.job.options={area:{x:0.2,y:0.2,width:0.2,height:0.2},prompt:'arbitrary instruction'};
 await runGalleryEdit(h.job.id);expect(h.provider).not.toHaveBeenCalled();expect(h.rpc).toHaveBeenCalledWith('settle_gallery_edit',{p_id:h.job.id,p_status:'failed'});
});
