import { beforeEach,expect,it,vi } from 'vitest';
import sharp from 'sharp';
import { GET as imageGET } from '@/app/api/delivery/[token]/marketing-photo/[id]/route';
import { GET as siteGET } from '@/app/api/delivery/[token]/site/route';
import { PUT } from '@/app/api/property-sites/[id]/route';
import { galleryAccess } from '@/lib/deliveries/token';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createClient } from '@/lib/supabase/server';
import { loadProperty } from './load-property';
import { createAdminClient } from '@/lib/supabase/server';
vi.mock('@/lib/deliveries/token',()=>({galleryAccess:vi.fn()}));
vi.mock('@/lib/auth/require-team-member',()=>({requireTeamMember:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(),createAdminClient:vi.fn()}));
vi.mock('@/lib/security/rate-limit',()=>({enforceRateLimit:vi.fn(async()=>null)}));
let order:any,photo:any,site:any,filters:any[],storage:any,upsert:any;
const slug='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{
 vi.resetAllMocks();order={id:'order',listing_id:'listing',status:'delivered',total_cents:10000,download_paid_at:'2026-09-01'};photo={id:'photo',filename:'finished.jpg',bucket:'delivery',storage_path:'finished.jpg'};site={slug,order_id:'order',is_published:true};filters=[];storage=vi.fn();upsert=vi.fn();
 const from=(table:string)=>{const q:any={};q.select=q.order=q.limit=q.in=()=>q;q.eq=(k:string,v:any)=>{filters.push([table,k,v]);return q;};q.upsert=(v:any)=>{upsert(v);return q;};const data=()=>table==='orders'?order:table==='photos'?photo:table==='property_sites'?site:{address_line1:'Test property'};q.single=q.maybeSingle=async()=>({data:data(),error:null});q.then=(resolve:any)=>Promise.resolve({data:table==='photos'?[photo]:data(),error:null}).then(resolve);return q;};
 const db={from,storage:{from:storage}};vi.mocked(galleryAccess).mockResolvedValue({error:null,link:{order_id:'order'},admin:db} as any);vi.mocked(createClient).mockResolvedValue(db as any);vi.mocked(createAdminClient).mockReturnValue(db as any);vi.mocked(requireTeamMember).mockResolvedValue({error:null,user:{id:'staff'}} as any);
});
const request=new Request('https://example.test');const ctx={params:Promise.resolve({token:'token',id:'photo'})};
it('rejects expired galleries and unpaid marketing images before reading storage',async()=>{
 vi.mocked(galleryAccess).mockResolvedValueOnce({error:new Response('',{status:410})} as any);expect((await imageGET(request,ctx)).status).toBe(410);
 order.download_paid_at=null;expect((await imageGET(request,ctx)).status).toBe(402);expect(storage).not.toHaveBeenCalled();expect((await siteGET(request,ctx)).status).toBe(200);
});
it('scopes marketing photos to the gallery order, selected finals, and rejects foreign or intermediate images',async()=>{
 photo=null;expect((await imageGET(request,ctx)).status).toBe(404);expect(filters).toContainEqual(['photos','order_id','order']);expect(filters).toContainEqual(['photos','is_selected',true]);
 photo={is_hdr:true,ai_provider:'oceano-enhance'};expect((await imageGET(request,ctx)).status).toBe(404);expect(storage).not.toHaveBeenCalled();
});
it('only returns published site links belonging to the gallery order',async()=>{
 expect(await (await siteGET(request,ctx)).json()).toEqual({url:`/property/${slug}`});expect(filters).toContainEqual(['property_sites','order_id','order']);expect(filters).toContainEqual(['property_sites','is_published',true]);
});
it('does not expose draft property metadata or sign photos to visitors, even with a preview flag',async()=>{
 site.is_published=false;expect(await loadProperty(slug,false)).toBeNull();
 vi.mocked(requireTeamMember).mockResolvedValue({error:new Response('',{status:403}),user:null} as any);expect(await loadProperty(slug,true)).toBeNull();expect(storage).not.toHaveBeenCalled();
});
it('rechecks payment before serving a published website',async()=>{order.download_paid_at=null;expect(await loadProperty(slug,false)).toBeNull();expect(storage).not.toHaveBeenCalled();});
it('requires staff and refuses publication of locked orders',async()=>{
 const req=()=>new Request('https://example.test',{method:'PUT',body:JSON.stringify({headline:'Test property',description:'',agent_name:'',agent_phone:'',agent_email:'',asking_price_cents:null,is_published:true})});
 vi.mocked(requireTeamMember).mockResolvedValueOnce({error:new Response('',{status:403}),user:null} as any);expect((await PUT(req(),ctx)).status).toBe(403);
 order.download_paid_at=null;expect((await PUT(req(),ctx)).status).toBe(409);expect(upsert).not.toHaveBeenCalled();
});

it('serves a resized JPEG from the authorized selected final and signs published website photos',async()=>{
 const bytes=await sharp({create:{width:8,height:6,channels:3,background:'#ddd'}}).png().toBuffer();
 const download=vi.fn(async()=>({data:new Blob([new Uint8Array(bytes)]),error:null}));const sign=vi.fn(async()=>({data:{signedUrl:'https://example.test/authorized-photo'},error:null}));storage.mockReturnValue({download,createSignedUrl:sign});
 const response=await imageGET(request,ctx);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format).toBe('jpeg');expect(download).toHaveBeenCalledWith('finished.jpg');
 const page=await loadProperty(slug,false);expect(page?.photos).toHaveLength(1);expect(sign).toHaveBeenCalledWith('finished.jpg',900);
});
