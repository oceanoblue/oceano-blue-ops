import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks = vi.hoisted(() => ({ db: vi.fn(), process: vi.fn(), reference: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.db }));
vi.mock('./index', () => ({ getProvider: () => ({ id: 'openai-gpt-image', process: mocks.process }) }));
vi.mock('./window-reference', () => ({ findWindowReference: mocks.reference }));
vi.mock('@/lib/observability/report', () => ({ captureError: vi.fn() }));
import { runAiJob } from './runner';
import { createEnhanceRecipe } from './recipe';
let tables: Record<string, any[]>;
let source: Buffer;
let generated: Buffer;
let uploaded: Buffer[];
let markerFails: boolean;
const makeDb = () => ({
  from(table: string) {
    let rows = tables[table] ?? [];
    let change: any = null;
    let insertion: any = null;
    const result = () => {
      if (change?.params?.paid_request_started && markerFails) return { data: null, error: { message: 'offline' } };
      if (change) for (const row of rows) Object.assign(row, change);
      if (insertion) { const list = Array.isArray(insertion) ? insertion : [insertion]; (tables[table] ??= []).push(...list); return {data:list}; }
      return { data: rows, error: null };
    };
    const q: any = {
      select: () => q,
      eq: (key:string,val:unknown) => { rows=rows.filter(r=>r[key]===val);return q; },
      in: (key:string,val:unknown[]) => { rows=rows.filter(r=>val.includes(r[key]));return q; },
      update: (value:unknown) => {change=value;return q;},
      insert: (value:unknown) => {insertion=value;return q;},
      maybeSingle: async () => {const r=result();return {...r,data:r.data?.[0]??null};},
      then: (resolve:any) => Promise.resolve(result()).then(resolve),
    }; return q;
  },
  storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array(source)])}),upload:async(_path:string,bytes:Buffer)=>{uploaded.push(bytes);return {};}})},
});
beforeEach(async()=>{
  uploaded=[];markerFails=false;
  source=await sharp({create:{width:128,height:96,channels:3,background:'#343434'}}).jpeg().toBuffer();
  generated=await sharp({create:{width:128,height:96,channels:3,background:'#cab391'}}).jpeg().toBuffer();
  const recipe=createEnhanceRecipe('openai-gpt-image');
  tables={ai_jobs:[{id:'job',order_id:'order',job_type:'enhance_single',provider:'openai-gpt-image',status:'pending',input_photo_ids:['current'],params:{recipe},prompt:recipe.prompt}],photos:[{id:'current',order_id:'order',filename:'current.jpg',storage_path:'current.jpg',bucket:'processed',processing_status:'complete'}],orders:[{id:'order',project_type:'mls_real_estate'}]};
  mocks.db.mockReturnValue(makeDb());
  mocks.reference.mockReset();
  mocks.reference.mockResolvedValue(null);
  mocks.process.mockReset();
  mocks.process.mockResolvedValue({outputs:[{bytes:generated,mimeType:'image/jpeg',filename:'finished.jpg'}],model:'gpt-image-2.5-sunburst',costCents:25,provenance:{reviewRequired:true}});
});
it('stores the actual generated finish and immutable recipe without a tone-transfer replacement',async()=>{
  expect((await runAiJob('job')).status).toBe('complete');
  expect(uploaded).toEqual([generated]);
  const photo=tables.photos.find(p=>p.id!=='current');
  expect(photo.parent_photo_id).toBe('current');
  expect(photo.ai_recipe).toMatchObject({version:2,source_photo_id:'current',provenance:{reviewRequired:true}});
  expect(photo.is_selected).toBeNull();
  expect(tables.ai_jobs[0].model).toBe('gpt-image-2.5-sunburst');
  expect(tables.ai_jobs[0].params.paid_request_started).toBe(true);
  expect((await runAiJob('job')).status).toBe('skipped');
  expect(mocks.process).toHaveBeenCalledTimes(1);
});
it('keeps the selected version first and same-capture reference second',async()=>{
  const reference={source:{bytes:source,filename:'dark.jpg',mimeType:'image/jpeg'},photoId:'dark'};
  mocks.reference.mockResolvedValue(reference);
  await runAiJob('job');
  expect(mocks.process.mock.calls[0][0].inputs.map((s:any)=>s.filename)).toEqual(['current.png','dark.jpg']);
  expect(tables.photos[1].ai_recipe.provenance.windowReferencePhotoId).toBe('dark');
});
it('keeps the last successful photo intact on failure',async()=>{
  mocks.process.mockRejectedValue(new Error('provider interrupted'));
  expect((await runAiJob('job')).status).toBe('failed');
  expect(tables.photos).toHaveLength(1);
  expect(tables.photos[0].processing_status).toBe('complete');
  expect(uploaded).toEqual([]);
});
it('stops before a paid render if the request marker cannot be persisted',async()=>{
  markerFails=true;
  expect((await runAiJob('job')).status).toBe('failed');
  expect(mocks.process).not.toHaveBeenCalled();
});
it('fails an explicit window pull before spending when no darker reference exists',async()=>{
  tables.ai_jobs[0].job_type='window_pull';
  expect((await runAiJob('job')).error).toContain('window_reference_missing');
  expect(mocks.process).not.toHaveBeenCalled();
});
it('does not attach a reference when window detail is off',async()=>{
  tables.ai_jobs[0].params.recipe.finish.windows='off';
  await runAiJob('job');
  expect(mocks.reference).not.toHaveBeenCalled();
  expect(mocks.process.mock.calls[0][0].inputs).toHaveLength(1);
});

it('uses lossless input pixels and stores PNG edits with the matching extension',async()=>{
  const png = await sharp(generated).png().toBuffer();
  mocks.process.mockResolvedValue({outputs:[{bytes:png,mimeType:'image/png',filename:'finish.png'}],model:'gpt-image-2.5-flare',costCents:25});
  await runAiJob('job');
  const input = mocks.process.mock.calls[0][0].inputs[0];
  expect(input.mimeType).toBe('image/png');
  expect((await sharp(input.bytes).metadata()).format).toBe('png');
  expect(await sharp(input.bytes).raw().toBuffer()).toEqual(await sharp(source).raw().toBuffer());
  expect(uploaded).toEqual([png]);
  expect(tables.photos[1]).toMatchObject({filename:'current-enhanced.png',mime_type:'image/png',is_selected:null});
});
