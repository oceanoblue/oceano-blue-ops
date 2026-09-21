import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { findWindowReference } from './window-reference';
let tables: Record<string, any[]>;
let jpeg: Buffer;
let downloads: string[];
function db() {
  return {
    from(table: string) {
      let rows = [...tables[table]];
      const q = {
        select() { return q; },
        eq(key: string, value: unknown) { rows = rows.filter(r => r[key] === value); return q; },
        in(key: string, values: unknown[]) { rows = rows.filter(r => values.includes(r[key])); return q; },
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then(resolve: (v: unknown) => unknown) { return Promise.resolve({data:rows}).then(resolve); },
      }; return q;
    },
    storage: { from: () => ({ download: vi.fn(async (path: string) => { downloads.push(path); return { data: new Blob([new Uint8Array(jpeg)]) }; }) }) },
  };
}
beforeEach(async () => {
  jpeg = await sharp({create:{width:32,height:32,channels:3,background:'#888'}}).jpeg().toBuffer();
  downloads=[];
  tables={ photos:[
    {id:'current',order_id:'order',parent_photo_id:'base',source_job_id:'enhance'},
    {id:'base',order_id:'order',parent_photo_id:'neutral',source_job_id:'merge'},
    {id:'neutral',order_id:'order',filename:'neutral.jpg',storage_path:'neutral.jpg',bucket:'raw',exif:{ExposureBiasValue:0}},
    {id:'dark',order_id:'order',filename:'dark.jpg',storage_path:'dark.jpg',bucket:'raw',exif:{ExposureBiasValue:-2}},
    {id:'unrelated',order_id:'order',filename:'other.jpg',storage_path:'other.jpg',bucket:'raw',exif:{ExposureBiasValue:-4}},
  ],ai_jobs:[
    {id:'enhance',order_id:'order',job_type:'enhance_single',input_photo_ids:['base']},
    {id:'merge',order_id:'order',job_type:'hdr_merge',input_photo_ids:['neutral','dark']},
  ]};
});
it('walks current-version lineage and chooses only a darker frame from its actual merge', async () => {
  const ref=await findWindowReference(db(),'current','order');
  expect(ref?.photoId).toBe('dark');
  expect(downloads).toEqual(['dark.jpg']);
  expect((await sharp(ref!.source.bytes!).metadata()).exif).toBeUndefined();
});
it('does not borrow another property or another dark photo in the same order', async () => {
  tables.photos.find(p=>p.id==='dark').order_id='other-order';
  expect(await findWindowReference(db(),'current','order')).toBeNull();
  expect(downloads).toEqual([]);
});
it('does not guess exposure from filename or an unknown EXIF value', async () => {
  tables.photos.find(p=>p.id==='dark').exif={};
  expect(await findWindowReference(db(),'current','order')).toBeNull();
});
it('terminates a cyclic or missing lineage', async () => {
  tables.photos[0].source_job_id=null; tables.photos[0].parent_photo_id='current';
  expect(await findWindowReference(db(),'current','order')).toBeNull();
  expect(await findWindowReference(db(),'missing','order')).toBeNull();
});
