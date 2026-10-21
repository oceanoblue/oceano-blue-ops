import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,afterAll,beforeEach,expect,it } from 'vitest';
let db:PGlite;
const order='00000000-0000-4000-8000-000000000001',photo='00000000-0000-4000-8000-000000000002',link='00000000-0000-4000-8000-000000000003',actor='00000000-0000-4000-8000-000000000004';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const options={area:{x:0.2,y:0.2,width:0.2,height:0.2}};
const reserve=(n:number,op='declutter',token='first',pid=photo)=>db.query<{reserve_gallery_edit:any}>(`select reserve_gallery_edit($1,$2,$3,$4,$5::jsonb)`,[token,id(n),pid,op,JSON.stringify(options)]);
const settle=(n:number,status='failed')=>db.query('select settle_gallery_edit($1,$2,$3)',[id(n),status,actor]);
const account=async()=> (await db.query<any>('select * from gallery_edit_accounts')).rows[0];
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table orders(id uuid primary key,listing_id uuid,total_cents int,download_paid_at timestamptz);
 create table photos(id uuid primary key,order_id uuid,kind text,is_selected boolean,is_hdr boolean,ai_provider text,bucket text,storage_path text,filename text);
 create table delivery_links(id uuid primary key,order_id uuid,token text,expires_at timestamptz);
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 grant all on orders,photos,delivery_links to service_role;`);
 await db.exec(readFileSync('supabase/migrations/20261021130126_gallery_guided_edits.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec(`reset role;truncate gallery_edits,gallery_edit_accounts,gallery_edit_days,delivery_links,photos,orders cascade;
 update gallery_edit_settings set enabled=true,allowance_cents=100,order_budget_cents=1000,daily_budget_cents=5000;
 insert into orders values('${order}','${order}',1000,now());
 insert into photos values('${photo}','${order}','delivered',true,false,null,'photos','original.jpg','original.jpg');
 insert into delivery_links values('${link}','${order}','first',now()+interval '1 day'),('${actor}','${order}','second',null);`);
});
it('shares five credits across links and charges once for identical concurrent requests',async()=>{
 await db.exec('set role service_role');
 const results=await Promise.all([reserve(1),reserve(1,'declutter','second')]);
 expect(results.map(r=>r.rows[0].reserve_gallery_edit.replay)).toEqual([false,true]);
 expect(await account()).toMatchObject({remaining:4,attempts:1,reserved_spend_cents:100});
 await expect(reserve(1,'virtual_stage')).rejects.toThrow('request_conflict');
 await expect(reserve(2,'virtual_stage','second')).rejects.toThrow('edit_in_progress');
});
it('refunds failures exactly once but retains incurred spend and attempt count',async()=>{
 await reserve(1,'virtual_stage');expect((await account()).remaining).toBe(3);
 await settle(1);await settle(1);expect(await account()).toMatchObject({remaining:5,attempts:1,reserved_spend_cents:100});
 await expect(settle(1,'approved')).rejects.toThrow('already_settled');
 expect((await db.query<any>('select reserved_spend_cents from gallery_edit_days')).rows[0].reserved_spend_cents).toBe(100);
});
it('blocks unpaid, expired, raw, unselected, merge intermediates and foreign photos',async()=>{
 await db.exec('update orders set download_paid_at=null');await expect(reserve(1)).rejects.toThrow('payment_required');
 await db.exec("update orders set download_paid_at=now();update delivery_links set expires_at=now()-interval '1 day'");await expect(reserve(1)).rejects.toThrow('gallery_unavailable');
 await db.exec('update delivery_links set expires_at=null');
 await expect(reserve(1,'declutter','first',id(44))).rejects.toThrow('photo_unavailable');
 for(const update of ["kind='raw'","kind='delivered',is_selected=false","is_selected=true,is_hdr=true,ai_provider='oceano-enhance'"]){await db.exec(`update photos set ${update}`);await expect(reserve(1)).rejects.toThrow('photo_unavailable');}
 expect(await account()).toBeUndefined();
});
it('requires completed generation and staff review before release',async()=>{
 await reserve(1);await expect(settle(1,'approved')).rejects.toThrow('not_reviewable');
 await db.exec("update gallery_edits set status='review'");await expect(settle(1,'approved')).rejects.toThrow('missing_output');
 await db.exec("update gallery_edits set output_path='result.jpg'");
 await expect(db.query("select settle_gallery_edit($1,'approved',null)",[id(1)])).rejects.toThrow('not_reviewable');
 await settle(1,'approved');expect((await account()).remaining).toBe(4);
 await expect(settle(1,'rejected')).rejects.toThrow('already_settled');
});
it('returns review-rejected credits and blocks repeat rejection refunds',async()=>{
 await reserve(1,'virtual_stage');await db.exec("update gallery_edits set status='review'");
 await settle(1,'rejected');await settle(1,'rejected');expect((await account()).remaining).toBe(5);
});
it('caps refunded retries by daily and lifetime order budgets',async()=>{
 await db.exec('update gallery_edit_settings set order_budget_cents=100');
 await reserve(1);await settle(1);await expect(reserve(2)).rejects.toThrow('order_limit');
 await db.exec('update gallery_edit_settings set order_budget_cents=1000,daily_budget_cents=100');
 await expect(reserve(2)).rejects.toThrow('daily_limit');
});
it('enforces ten total attempts, fifteen minute throttle, balance and kill switch',async()=>{
 for(let n=1;n<=3;n++){await reserve(n);await settle(n);}
 await expect(reserve(4)).rejects.toThrow('rate_limited');
 await db.exec("update gallery_edits set created_at=now()-interval '16 minutes';update gallery_edit_accounts set attempts=10");
 await expect(reserve(4)).rejects.toThrow('order_limit');
 await db.exec('update gallery_edit_accounts set attempts=3,remaining=1');await expect(reserve(4,'virtual_stage')).rejects.toThrow('insufficient_credits');
 await db.exec('update gallery_edit_settings set enabled=false');await expect(reserve(4)).rejects.toThrow('editing_paused');
});
it('excludes public and authenticated roles from ledger, settings and privileged functions',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  for(const table of ['gallery_edits','gallery_edit_accounts','gallery_edit_days','gallery_edit_settings']) await expect(db.query(`select * from ${table}`)).rejects.toThrow('permission denied');
  await expect(reserve(1)).rejects.toThrow('permission denied');await expect(settle(1)).rejects.toThrow('permission denied');
  await db.exec('reset role');
 }
 const rows=(await db.query<any>("select relname,relrowsecurity from pg_class where relname in ('gallery_edits','gallery_edit_accounts','gallery_edit_days','gallery_edit_settings')")).rows;
 expect(rows).toHaveLength(4);expect(rows.every(r=>r.relrowsecurity)).toBe(true);
 expect((await db.query<any>("select public from storage.buckets where id='gallery-edits'")).rows[0].public).toBe(false);
});
