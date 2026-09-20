import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';

let db: PGlite;
const client='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema storage;
    create function public.current_client_ids() returns setof uuid language sql as $$
      select unnest(string_to_array(current_setting('test.clients',true),','))::uuid $$;
    create function public.is_team_member() returns boolean language sql as $$select coalesce(current_setting('test.staff',true),'no')='yes'$$;
    create table public.orders(id uuid primary key,listing_id uuid,client_id uuid,total_cents int,download_paid_at timestamptz,status text);
    create table public.listings(id uuid primary key,client_id uuid);
    create table public.photos(id uuid primary key,order_id uuid,kind text,is_selected boolean,bucket text,storage_path text);
    create table public.listing_deliverables(id uuid primary key,listing_id uuid,order_id uuid,is_published boolean);
    create table storage.objects(id uuid primary key,bucket_id text,name text);
    grant usage on schema storage to anon,authenticated;
    grant select on all tables in schema public,storage to anon,authenticated;
    alter table public.orders enable row level security;
    alter table public.listings enable row level security;
    alter table public.photos enable row level security;
    alter table public.listing_deliverables enable row level security;
    alter table storage.objects enable row level security;
    create policy clients on orders for select using(client_id in(select current_client_ids()));
    create policy clients on listings for select using(client_id in(select current_client_ids()));
    create policy "client read own delivered photos" on photos for select using(false);
    create policy "client read own published deliverables" on listing_deliverables for select using(false);
    create policy "client read own delivery files" on storage.objects for select using(false);
    create policy "client read own renders" on storage.objects for select using(false);
    create policy staff on photos for all using(is_team_member());
    create policy staff on listing_deliverables for all using(is_team_member());
    create policy staff on storage.objects for all using(is_team_member());
  `);
  await db.exec(readFileSync('supabase/migrations/20260920224331_client_download_entitlements.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`reset role;set test.staff='no';set test.clients='${client}';truncate orders,listings,photos,listing_deliverables,storage.objects;
    insert into listings values('${id(99)}','${client}'),('${id(98)}','${other}');`);
  for(let n=1;n<=6;n++) {
    await db.query('insert into orders values($1,$2,$3,$4,$5,$6)',[id(n),id(99),n===5?other:client,n===3?0:n===4?null:10000,n===2?'2026-09-20':null,n===6?'ready':'delivered']);
    await db.query("insert into photos values($1,$2,'delivered',true,'delivery',$3)",[id(n),id(n),`${id(n)}/photo.jpg`]);
    await db.query("insert into storage.objects values($1,'delivery',$2),($3,'reel-renders',$4)",[id(n),`${id(n)}/photo.jpg`,id(n+10),`${id(n)}/reel.mp4`]);
    await db.query('insert into listing_deliverables values($1,$2,$3,true)',[id(n),id(99),id(n)]);
  }
  await db.exec('set role authenticated');
});
const rows=async(table:string)=>(await db.query<{id:string}>(`select id from ${table} order by id`)).rows.map(r=>r.id);
it('denies unpaid, foreign and unready originals while retaining paid/free files',async()=>{
  expect(await rows('photos')).toEqual([id(2),id(3),id(4)]);
  expect(await rows('listing_deliverables')).toEqual([id(2),id(3),id(4)]);
  expect(await rows('storage.objects')).toEqual([id(2),id(3),id(4),id(12),id(13),id(14)]);
});
it('paying for one order never unlocks other orders at the same property',async()=>{
  await db.exec(`reset role;update orders set download_paid_at=now() where id='${id(1)}';set role authenticated;`);
  expect(await rows('photos')).toEqual([id(1),id(2),id(3),id(4)]);
  expect(await rows('listing_deliverables')).toEqual([id(1),id(2),id(3),id(4)]);
});
it('keeps paid reels private until delivery',async()=>{
  await db.exec(`reset role;update orders set download_paid_at=now() where id='${id(6)}';set role authenticated;`);
  expect(await rows('storage.objects')).not.toContain(id(16));
});
it('supports authorized client-team membership without granting access to other clients',async()=>{
  await db.exec(`set test.clients='${other}';`);
  expect(await rows('photos')).toEqual([]);
  await db.exec(`set test.clients='${client},${other}';`);
  expect(await rows('photos')).toEqual([id(2),id(3),id(4)]);
});
it('withholds unpublished, unassigned and wrong-listing deliverables',async()=>{
  await db.exec(`reset role;update listing_deliverables set is_published=false where id='${id(2)}';
    update listing_deliverables set order_id=null where id='${id(3)}';
    update listing_deliverables set listing_id='${id(98)}' where id='${id(4)}';set role authenticated;`);
  expect(await rows('listing_deliverables')).toEqual([]);
});
it('keeps staff access and denies anonymous direct reads',async()=>{
  await db.exec("set test.staff='yes';");
  expect(await rows('photos')).toHaveLength(6);
  expect(await rows('listing_deliverables')).toHaveLength(6);
  expect(await rows('storage.objects')).toHaveLength(12);
  await db.exec("set test.staff='no';reset role;set role anon;");
  expect(await rows('photos')).toEqual([]);
  expect(await rows('listing_deliverables')).toEqual([]);
  expect(await rows('storage.objects')).toEqual([]);
});
