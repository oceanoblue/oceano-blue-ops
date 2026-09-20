import sharp from 'sharp';
import { beforeEach, expect, it, vi } from 'vitest';
import { GET as preview } from '@/app/api/delivery/[token]/preview/[id]/route';
import { GET as gallery } from '@/app/api/delivery/[token]/route';
import { GET as download } from '@/app/api/delivery/[token]/download/route';
import { createAdminClient } from '@/lib/supabase/server';
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
const storageDownload=vi.fn(), sign=vi.fn();
let rows:Record<string,any>;
beforeEach(()=>{
  vi.clearAllMocks();
  rows={
    delivery_links:{id:'link',order_id:'order',expires_at:null,view_count:0},
    orders:{id:'order',order_number:1,listing_id:'listing',total_cents:35000,download_paid_at:null},
    listings:{address_line1:'123 Sample Way'},
    photos:[{id:'photo',bucket:'processed',storage_path:'master.jpg',filename:'photo.jpg',width:1800,height:1200}],
    listing_deliverables:[],
    business_settings:{gallery_watermark_enabled:false},
  };
  const from=(table:string)=>{
    const q:any={};
    for(const method of ['select','eq','in','order','update']) q[method]=()=>q;
    q.single=q.maybeSingle=async()=>({data:Array.isArray(rows[table])?rows[table][0]??null:rows[table],error:null});
    q.then=(resolve:any)=>Promise.resolve({data:rows[table],error:null}).then(resolve);
    return q;
  };
  sign.mockResolvedValue({data:[{path:'master.jpg',signedUrl:'https://storage.test/signed-master'}]});
  vi.mocked(createAdminClient).mockReturnValue({from,storage:{from:()=>({download:storageDownload,createSignedUrls:sign,createSignedUrl:sign})}} as any);
});
const req=new Request('https://example.test/api/delivery/token');
const params={params:Promise.resolve({token:'token',id:'photo'})};
it('serves a clean resized image without any watermark overlay or source metadata',async()=>{
  const input=await sharp({create:{width:1800,height:1200,channels:3,background:{r:100,g:150,b:200}}}).withMetadata().png().toBuffer();
  storageDownload.mockResolvedValue({data:new Blob([new Uint8Array(input)])});
  const response=await preview(req,params);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/jpeg');
  const output=Buffer.from(await response.arrayBuffer());
  const meta=await sharp(output).metadata();
  expect(meta.width).toBe(1400);expect(meta.height).toBeLessThan(1400);expect(meta.exif).toBeUndefined();
  const stats=await sharp(output).stats();
  for(const [index,target] of [100,150,200].entries()) {
    expect(Math.abs(stats.channels[index].min-target)).toBeLessThan(5);
    expect(Math.abs(stats.channels[index].max-target)).toBeLessThan(5);
  }
});
it('rejects expired galleries before reading the stored photo',async()=>{
  rows.delivery_links.expires_at='2020-01-01';
  expect((await preview(req,params)).status).toBe(410);expect(storageDownload).not.toHaveBeenCalled();
});
it('returns preview URLs and withholds signed master URLs for unpaid galleries',async()=>{
  const response=await gallery(req,params);const body=await response.json();
  expect(body.paywall.active).toBe(true);
  expect(body.photos[0].url).toBe('/api/delivery/token/preview/photo?v=3&watermark=0');
  expect(sign).not.toHaveBeenCalled();
});
it('returns full-resolution links once payment is recorded',async()=>{
  rows.orders.download_paid_at='2026-09-17T12:53:07Z';
  const body=await (await gallery(req,params)).json();
  expect(body.paywall.active).toBe(false);expect(body.photos[0].url).toBe('https://storage.test/signed-master');
});
it.each(['full','4k','print','web'])('blocks unpaid %s downloads even with a forged paid URL',async size=>{
  const response=await download(new Request(`https://example.test/api/delivery/token/download?size=${size}&paid=1`),params);
  expect(response.status).toBe(402);expect(storageDownload).not.toHaveBeenCalled();
});

it('adds a watermark when globally enabled, ignoring an unwatermarked URL parameter',async()=>{
  rows.business_settings.gallery_watermark_enabled=true;
  const input=await sharp({create:{width:1400,height:933,channels:3,background:{r:100,g:150,b:200}}}).png().toBuffer();
  storageDownload.mockResolvedValue({data:new Blob([new Uint8Array(input)])});
  const response=await preview(new Request('https://example.test/preview/photo?watermark=0'),params);
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
  const stats=await sharp(Buffer.from(await response.arrayBuffer())).stats();
  expect(stats.channels[0].max-stats.channels[0].min).toBeGreaterThan(25);
  const body=await (await gallery(req,params)).json();
  expect(body.paywall.watermarked).toBe(true);expect(body.photos[0].url).toContain('watermark=1');
  expect(sign).not.toHaveBeenCalled();
  expect((await download(req,params)).status).toBe(402);
});
it('does not expose a clean preview when the global setting cannot be loaded',async()=>{
  rows.business_settings=null;
  expect((await preview(req,params)).status).toBe(503);
  expect((await gallery(req,params)).status).toBe(503);
  expect(storageDownload).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
});
it('global watermark setting never adds overlays to paid gallery master URLs',async()=>{
  rows.business_settings.gallery_watermark_enabled=true;
  rows.orders.download_paid_at='2026-09-17T12:53:07Z';
  const body=await (await gallery(req,params)).json();
  expect(body.paywall.watermarked).toBe(false);expect(body.photos[0].url).toBe('https://storage.test/signed-master');
});
